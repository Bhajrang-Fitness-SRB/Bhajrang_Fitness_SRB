"""Core Vedic (jyotish) calculations on top of the Swiss Ephemeris (pyswisseph).

Everything here is pure Python and has no web code, so it can be tested on its own.
Zodiac: sidereal. Default ayanamsa: Lahiri (Chitrapaksha). Houses: whole-sign.
"""
from __future__ import annotations

import datetime as dt
import os
import threading
from typing import Any

import swisseph as swe

RASHIS = ["Mesha (Aries)", "Vrishabha (Taurus)", "Mithuna (Gemini)", "Karka (Cancer)", "Simha (Leo)", "Kanya (Virgo)",
          "Tula (Libra)", "Vrishchika (Scorpio)", "Dhanu (Sagittarius)", "Makara (Capricorn)", "Kumbha (Aquarius)", "Meena (Pisces)"]
RASHI_LORDS = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"]
NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha",
              "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula",
              "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"]
DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]
DASHA_YEARS = {"Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10, "Mars": 7, "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17}
NAK_SPAN = 360.0 / 27.0           # 13°20'
YEAR_DAYS = 365.25                 # Vimshottari year used by most software

AYANAMSAS = {"lahiri": swe.SIDM_LAHIRI, "raman": swe.SIDM_RAMAN, "krishnamurti": swe.SIDM_KRISHNAMURTI}
BODIES = [("Sun", swe.SUN), ("Moon", swe.MOON), ("Mars", swe.MARS), ("Mercury", swe.MERCURY),
          ("Jupiter", swe.JUPITER), ("Venus", swe.VENUS), ("Saturn", swe.SATURN)]
# Vedic planetary aspects (graha drishti), counted in houses from the planet (7th is universal).
ASPECT_HOUSES = {"Sun": [7], "Moon": [7], "Mercury": [7], "Venus": [7], "Mars": [4, 7, 8], "Jupiter": [5, 7, 9],
                 "Saturn": [3, 7, 10], "Rahu": [5, 7, 9], "Ketu": [5, 7, 9]}

_LOCK = threading.Lock()           # pyswisseph keeps global state (ayanamsa mode), so calls are serialised


def _ephe_flag() -> tuple[int, str]:
    path = os.environ.get("SE_EPHE_PATH", "")
    if path and os.path.exists(os.path.join(path, "sepl_18.se1")):
        swe.set_ephe_path(path)
        return swe.FLG_SWIEPH, "Swiss Ephemeris data files"
    return swe.FLG_MOSEPH, "Moshier (built-in, about 1 arc-second planets)"


EPH_FLAG, EPH_NAME = _ephe_flag()


def to_utc(date: str, time: str, tz_hours: float) -> dt.datetime:
    y, m, d = (int(x) for x in date.split("-"))
    hh, mm = (int(x) for x in (time or "12:00").split(":")[:2])
    return dt.datetime(y, m, d, hh, mm, tzinfo=dt.timezone.utc) - dt.timedelta(hours=tz_hours)


def julday(u: dt.datetime) -> float:
    return swe.julday(u.year, u.month, u.day, u.hour + u.minute / 60 + u.second / 3600)


def _norm(x: float) -> float:
    return x % 360.0


def sign_info(lon: float) -> dict[str, Any]:
    lon = _norm(lon)
    r = int(lon // 30)
    return {"lon": round(lon, 5), "rashi": r, "rashi_name": RASHIS[r], "deg": round(lon - r * 30, 4)}


def nakshatra_info(lon: float) -> dict[str, Any]:
    """Nakshatra, pada, Vimshottari star lord and the KP sub lord."""
    lon = _norm(lon)
    idx = min(26, int(lon / NAK_SPAN + 1e-11))      # tiny tolerance so exact boundaries (40.0°, ...) never fall in the wrong nakshatra
    within = max(0.0, lon - idx * NAK_SPAN)
    star_lord = DASHA_ORDER[idx % 9]
    pada = int(within // (NAK_SPAN / 4)) + 1
    # KP: the nakshatra is split into 9 unequal sub-parts, starting with the star lord, sized by dasha years.
    start = DASHA_ORDER.index(star_lord)
    acc = 0.0
    sub_lord = DASHA_ORDER[(start + 8) % 9]         # if rounding lands on the very end, it is the last sub lord
    for k in range(9):
        lord = DASHA_ORDER[(start + k) % 9]
        span = NAK_SPAN * DASHA_YEARS[lord] / 120.0
        if within < acc + span - 1e-12:
            sub_lord = lord
            break
        acc += span
    return {"nakshatra": NAKSHATRAS[idx], "nakshatra_index": idx, "pada": pada, "star_lord": star_lord, "sub_lord": sub_lord,
            "fraction_elapsed": within / NAK_SPAN}


def navamsa_rashi(lon: float) -> int:
    lon = _norm(lon)
    sign = int(lon // 30)
    n = int((lon - sign * 30) // (30 / 9))
    start = {0: 0, 1: 9, 2: 6, 3: 3}[sign % 4]   # fire->Aries, earth->Capricorn, air->Libra, water->Cancer
    return (start + n) % 12


def calc(jd: float, ayanamsa: str = "lahiri", node: str = "mean") -> dict[str, Any]:
    """Sidereal planet longitudes and speeds, plus the ayanamsa used."""
    mode = AYANAMSAS.get(ayanamsa, swe.SIDM_LAHIRI)
    flags = EPH_FLAG | swe.FLG_SIDEREAL | swe.FLG_SPEED
    out: dict[str, Any] = {}
    with _LOCK:
        swe.set_sid_mode(mode)
        for name, body in BODIES:
            xx = swe.calc_ut(jd, body, flags)[0]
            out[name] = (xx[0], xx[3])
        rb = swe.TRUE_NODE if node == "true" else swe.MEAN_NODE
        xx = swe.calc_ut(jd, rb, flags)[0]
        out["Rahu"] = (xx[0], xx[3])
        out["Ketu"] = (_norm(xx[0] + 180.0), xx[3])
        ay = swe.get_ayanamsa_ut(jd)
    return {"planets": out, "ayanamsa": ay}


def ascendant(jd: float, lat: float, lon: float, ayanamsa: str = "lahiri") -> float:
    mode = AYANAMSAS.get(ayanamsa, swe.SIDM_LAHIRI)
    with _LOCK:
        swe.set_sid_mode(mode)
        _cusps, ascmc = swe.houses_ex(jd, lat, lon, b"W", swe.FLG_SIDEREAL)
    return _norm(ascmc[0])


def mahadashas(moon_lon: float, birth_utc: dt.datetime) -> list[dict[str, Any]]:
    info = nakshatra_info(moon_lon)
    lord = info["star_lord"]
    elapsed_years = info["fraction_elapsed"] * DASHA_YEARS[lord]
    start = birth_utc - dt.timedelta(days=elapsed_years * YEAR_DAYS)
    out = []
    i = DASHA_ORDER.index(lord)
    for k in range(9):
        l = DASHA_ORDER[(i + k) % 9]
        end = start + dt.timedelta(days=DASHA_YEARS[l] * YEAR_DAYS)
        out.append({"lord": l, "start": start, "end": end})
        start = end
    return out


def _sub_periods(parent_lord: str, start: dt.datetime, total_days: float) -> list[dict[str, Any]]:
    i = DASHA_ORDER.index(parent_lord)
    res = []
    for k in range(9):
        l = DASHA_ORDER[(i + k) % 9]
        end = start + dt.timedelta(days=total_days * DASHA_YEARS[l] / 120.0)
        res.append({"lord": l, "start": start, "end": end})
        start = end
    return res


def dasha_at(moon_lon: float, birth_utc: dt.datetime, at: dt.datetime) -> dict[str, Any]:
    mahas = mahadashas(moon_lon, birth_utc)
    maha = next((m for m in mahas if m["start"] <= at < m["end"]), mahas[-1] if at >= mahas[-1]["end"] else mahas[0])
    antars = _sub_periods(maha["lord"], maha["start"], (maha["end"] - maha["start"]).total_seconds() / 86400)
    antar = next((a for a in antars if a["start"] <= at < a["end"]), antars[-1])
    pratys = _sub_periods(antar["lord"], antar["start"], (antar["end"] - antar["start"]).total_seconds() / 86400)
    praty = next((p for p in pratys if p["start"] <= at < p["end"]), pratys[-1])
    iso = lambda p: {"lord": p["lord"], "start": p["start"].date().isoformat(), "end": p["end"].date().isoformat()}
    return {"maha": iso(maha), "antar": iso(antar), "pratyantar": iso(praty),
            "all_maha": [iso(m) for m in mahas], "antars_in_current_maha": [iso(a) for a in antars]}


def build_chart(date: str, time: str, tz_hours: float, lat: float, lon: float, ayanamsa: str = "lahiri", node: str = "mean",
                at: dt.datetime | None = None) -> dict[str, Any]:
    utc = to_utc(date, time, tz_hours)
    jd = julday(utc)
    c = calc(jd, ayanamsa, node)
    lag_lon = ascendant(jd, lat, lon, ayanamsa)
    lag = {**sign_info(lag_lon), **nakshatra_info(lag_lon), "lord": RASHI_LORDS[int(lag_lon // 30)], "navamsa": navamsa_rashi(lag_lon)}
    planets = []
    for name in ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]:
        l, speed = c["planets"][name]
        s = sign_info(l)
        n = nakshatra_info(l)
        planets.append({"name": name, **s, **{k: n[k] for k in ("nakshatra", "pada", "star_lord", "sub_lord")},
                        "house": (s["rashi"] - lag["rashi"]) % 12 + 1, "sign_lord": RASHI_LORDS[s["rashi"]],
                        "retrograde": (speed < 0) if name not in ("Sun", "Moon") else False,
                        "speed_deg_per_day": round(speed, 4), "navamsa": navamsa_rashi(l)})
    moon = next(p for p in planets if p["name"] == "Moon")
    now = at or dt.datetime.now(dt.timezone.utc)
    dasha = dasha_at(moon["lon"], utc, now)
    # who aspects which house (whole-sign graha drishti)
    aspects = []
    for p in planets:
        for h in ASPECT_HOUSES.get(p["name"], []):
            if h == 1:
                continue
            aspects.append({"planet": p["name"], "from_house": p["house"], "aspects_house": (p["house"] + h - 2) % 12 + 1, "distance": h})
    return {"utc": utc.isoformat(), "ayanamsa_name": ayanamsa, "ayanamsa_deg": round(c["ayanamsa"], 5), "node": node,
            "ephemeris": EPH_NAME, "lagna": lag, "planets": planets, "dasha": dasha, "aspects": aspects}


def transit_snapshot(at: dt.datetime, natal: dict[str, Any] | None = None, ayanamsa: str = "lahiri", node: str = "mean") -> dict[str, Any]:
    c = calc(julday(at), ayanamsa, node)
    rows = []
    for name in ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]:
        l, speed = c["planets"][name]
        s = sign_info(l)
        n = nakshatra_info(l)
        row = {"name": name, **s, "nakshatra": n["nakshatra"], "pada": n["pada"],
               "retrograde": (speed < 0) if name not in ("Sun", "Moon") else False}
        if natal:
            row["house_from_lagna"] = (s["rashi"] - natal["lagna"]["rashi"]) % 12 + 1
            moon = next(p for p in natal["planets"] if p["name"] == "Moon")
            row["house_from_moon"] = (s["rashi"] - moon["rashi"]) % 12 + 1
        rows.append(row)
    result: dict[str, Any] = {"at": at.isoformat(), "planets": rows}
    if natal:
        sat = next(r for r in rows if r["name"] == "Saturn")
        result["sade_sati"] = sat["house_from_moon"] in (12, 1, 2)
        result["sade_sati_phase"] = {12: "rising (Saturn 12th from Moon)", 1: "peak (Saturn over Moon)", 2: "setting (Saturn 2nd from Moon)"}.get(sat["house_from_moon"])
    return result


def facts_text(chart: dict[str, Any], transit: dict[str, Any] | None = None) -> str:
    """Compact plain-text facts for the AI agent."""
    lg = chart["lagna"]
    lines = [f"SWISS EPHEMERIS FACTS ({chart['ephemeris']}; {chart['ayanamsa_name'].title()} ayanamsa {chart['ayanamsa_deg']:.3f}°; {chart['node']} nodes; whole-sign houses)",
             f"Lagna: {lg['rashi_name']} {lg['deg']:.2f}°, nakshatra {lg['nakshatra']} pada {lg['pada']}, lord {lg['lord']}; navamsa lagna {RASHIS[lg['navamsa']]}"]
    for p in chart["planets"]:
        r = " (retrograde)" if p["retrograde"] else ""
        lines.append(f"{p['name']}: {p['rashi_name']} {p['deg']:.2f}°{r}, house {p['house']}, {p['nakshatra']} pada {p['pada']} (star lord {p['star_lord']}, KP sub lord {p['sub_lord']}), navamsa {RASHIS[p['navamsa']]}")
    d = chart["dasha"]
    lines.append(f"Vimshottari now: {d['maha']['lord']} mahadasha ({d['maha']['start']} to {d['maha']['end']}), {d['antar']['lord']} antardasha ({d['antar']['start']} to {d['antar']['end']}), {d['pratyantar']['lord']} pratyantar (to {d['pratyantar']['end']})")
    if transit:
        lines.append("Transits now: " + "; ".join(f"{r['name']} {r['rashi_name'].split(' ')[0]} {r['deg']:.1f}°{' R' if r['retrograde'] else ''} (house {r.get('house_from_lagna', '?')} from lagna)" for r in transit["planets"]))
        if transit.get("sade_sati") is not None:
            lines.append("Saturn Sade Sati: " + (f"yes, {transit['sade_sati_phase']}" if transit["sade_sati"] else "no"))
    return "\n".join(lines)
