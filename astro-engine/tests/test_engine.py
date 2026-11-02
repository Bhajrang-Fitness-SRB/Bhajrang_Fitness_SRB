"""Run:  cd astro-engine && ASTRO_ENGINE_KEY=test pytest -q
Cross-checks the Swiss Ephemeris engine against three independent sources:
the app's built-in engine (astronomy-engine), Kerykeion, and VedicAstro."""
import json, os, pathlib, sys, datetime as dt
import pytest

os.environ.setdefault("ASTRO_ENGINE_KEY", "test-key")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import vedic  # noqa: E402

FX = pathlib.Path(__file__).parent / "fixtures"
CASES = json.load(open(FX / "cases.json"))
BUILTIN = {c["name"]: c for c in json.load(open(FX / "builtin_engine.json"))}


def diff(a, b):
    return abs(((a - b + 540) % 360) - 180)


@pytest.mark.parametrize("c", CASES, ids=[c["name"] for c in CASES])
def test_agrees_with_builtin_app_engine(c):
    ch = vedic.build_chart(c["date"], c["time"], c["tz"], c["lat"], c["lon"])
    ref = BUILTIN[c["name"]]
    for p in ch["planets"]:
        assert diff(p["lon"], ref[p["name"]]) < 0.02, f"{p['name']} differs by more than 0.02°"
    assert diff(ch["lagna"]["lon"], ref["Lagna"]) < 0.02


@pytest.mark.parametrize("c", CASES, ids=[c["name"] for c in CASES])
def test_agrees_with_kerykeion(c):
    kery = pytest.importorskip("kerykeion")
    from kerykeion import AstrologicalSubjectFactory as F
    u = vedic.to_utc(c["date"], c["time"], c["tz"])
    s = F.from_birth_data("t", u.year, u.month, u.day, u.hour, u.minute, lng=c["lon"], lat=c["lat"], tz_str="UTC", online=False,
                          zodiac_type="Sidereal", sidereal_mode="LAHIRI", houses_system_identifier="W")
    ch = vedic.build_chart(c["date"], c["time"], c["tz"], c["lat"], c["lon"])
    got = {p["name"]: p["lon"] for p in ch["planets"]}
    for name, obj in {"Sun": s.sun, "Moon": s.moon, "Mars": s.mars, "Mercury": s.mercury, "Jupiter": s.jupiter, "Venus": s.venus, "Saturn": s.saturn}.items():
        assert diff(got[name], obj.abs_pos) < 0.003, name
    assert diff(ch["lagna"]["lon"], s.ascendant.abs_pos) < 0.003


@pytest.mark.parametrize("c", CASES, ids=[c["name"] for c in CASES])
def test_agrees_with_vedicastro_kp_and_dasha(c):
    pytest.importorskip("vedicastro")
    from vedicastro.VedicAstro import VedicHoroscopeData
    y, m, d = map(int, c["date"].split("-")); hh, mm = map(int, c["time"].split(":"))
    sign = "+" if c["tz"] >= 0 else "-"; tz = abs(c["tz"]); utc = f"{sign}{int(tz)}:{int(round((tz % 1) * 60)):02d}"
    h = VedicHoroscopeData(year=y, month=m, day=d, hour=hh, minute=mm, second=0, utc=utc, latitude=c["lat"], longitude=c["lon"],
                           ayanamsa="Lahiri", house_system="Whole Sign")
    ch = h.generate_chart()
    theirs = {p.Object: p for p in h.get_planets_data_from_chart(ch)}
    mine = vedic.build_chart(c["date"], c["time"], c["tz"], c["lat"], c["lon"])
    for p in mine["planets"]:
        if p["name"] in ("Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"):
            assert diff(p["lon"], theirs[p["name"]].LonDecDeg) < 0.01, p["name"]
            assert p["sub_lord"] == theirs[p["name"]].SubLord, f"KP sub lord of {p['name']}"
    dd = h.compute_vimshottari_dasa(ch)
    first = vedic.mahadashas(next(p for p in mine["planets"] if p["name"] == "Moon")["lon"], vedic.to_utc(c["date"], c["time"], c["tz"]))[0]
    their_start = dt.datetime.strptime(dd[first["lord"]]["start"], "%d-%m-%Y").date()
    assert abs((first["start"].date() - their_start).days) <= 2, "first mahadasha start"


def test_vimshottari_length_is_120_years_and_continuous():
    mahas = vedic.mahadashas(46.553, dt.datetime(1990, 8, 15, 1, 0, tzinfo=dt.timezone.utc))
    assert abs((mahas[-1]["end"] - mahas[0]["start"]).days / 365.25 - 120) < 1e-6
    for a, b in zip(mahas, mahas[1:]):
        assert a["end"] == b["start"]


def test_known_values():
    assert vedic.nakshatra_info(0.0)["nakshatra"] == "Ashwini" and vedic.nakshatra_info(0.0)["sub_lord"] == "Ketu"
    assert vedic.nakshatra_info(359.99)["nakshatra"] == "Revati"
    assert vedic.navamsa_rashi(0.0) == 0 and vedic.navamsa_rashi(30.0) == 9 and vedic.navamsa_rashi(60.0) == 6 and vedic.navamsa_rashi(90.0) == 3
    assert vedic.navamsa_rashi(28.23 + 90) == 11   # Cancer 28.23° -> Pisces


def test_sub_lords_cover_every_nakshatra_exactly():
    for i in range(27):
        seen = [vedic.nakshatra_info(i * vedic.NAK_SPAN + f * vedic.NAK_SPAN)["sub_lord"] for f in (0.0, 0.02, 0.2, 0.9, 0.999)]
        assert seen[0] == vedic.DASHA_ORDER[i % 9]    # a nakshatra always starts with its own lord
        assert all(s in vedic.DASHA_YEARS for s in seen)


# ------------------------------------------------------------------ web API
@pytest.fixture()
def client():
    from fastapi.testclient import TestClient
    import app as appmod
    appmod.ENGINE_KEY = "test-key"
    return TestClient(appmod.app)

BODY = {"name": "T", "date": "1990-08-15", "time": "06:30", "tz_hours": 5.5, "lat": 22.5726, "lon": 88.3639, "at": "2026-11-02"}


def test_health_is_public(client):
    r = client.get("/health"); assert r.status_code == 200 and r.json()["ok"]


def test_chart_needs_the_secret_key(client):
    assert client.post("/chart", json=BODY).status_code == 401
    assert client.post("/chart", json=BODY, headers={"x-engine-key": "wrong"}).status_code == 401


def test_refuses_to_run_without_a_configured_key(client):
    import app as appmod
    appmod.ENGINE_KEY = ""
    assert client.post("/chart", json=BODY, headers={"x-engine-key": ""}).status_code == 503


def test_chart_ok_and_facts_present(client):
    r = client.post("/chart", json=BODY, headers={"x-engine-key": "test-key"})
    assert r.status_code == 200, r.text
    j = r.json(); assert j["chart"]["lagna"]["rashi_name"].startswith("Simha") and "SWISS EPHEMERIS FACTS" in j["facts"]
    assert j["chart"]["dasha"]["maha"]["lord"] == "Jupiter" and j["transits"]["planets"][0]["name"] == "Sun"


@pytest.mark.parametrize("bad", [{"date": "15-08-1990"}, {"date": "1990-02-31"}, {"time": "25:00"}, {"lat": 120}, {"lon": 400}, {"tz_hours": 30}, {"date": "1500-01-01"}])
def test_bad_input_is_refused(client, bad):
    assert client.post("/chart", json={**BODY, **bad}, headers={"x-engine-key": "test-key"}).status_code == 422


def test_western_aspects_and_wheel(client):
    h = {"x-engine-key": "test-key"}
    a = client.post("/western-aspects", json=BODY, headers=h); assert a.status_code == 200 and a.json()["aspects"]
    w = client.post("/wheel", json=BODY, headers=h); assert w.status_code == 200 and w.json()["svg_base64"]
