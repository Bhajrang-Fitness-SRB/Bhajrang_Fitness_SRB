"""SRB Bhajrang Fitness – Astro Engine (private web service).

Runs the Swiss Ephemeris (pyswisseph) and Kerykeion for the owner's Astro Master.
Not for the public: every call except /health needs the secret header `x-engine-key`.
The Supabase function `agent-hub` is the only caller; it checks the OWNER passcode first.
"""
from __future__ import annotations

import base64
import datetime as dt
import hmac
import os
import re
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

import vedic

app = FastAPI(title="Bhajrang Astro Engine", docs_url=None, redoc_url=None, openapi_url=None)

ENGINE_KEY = os.environ.get("ASTRO_ENGINE_KEY", "")


def require_key(x_engine_key: str = Header(default="")) -> None:
    if not ENGINE_KEY:
        raise HTTPException(503, "ASTRO_ENGINE_KEY is not set on the server.")
    if not hmac.compare_digest(x_engine_key.encode(), ENGINE_KEY.encode()):
        raise HTTPException(401, "Wrong engine key.")


class Birth(BaseModel):
    name: str = Field(default="Native", max_length=80)
    date: str                                  # YYYY-MM-DD
    time: str = "12:00"                        # HH:MM, local time
    tz_hours: float = Field(default=5.5, ge=-14, le=14)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    ayanamsa: Literal["lahiri", "raman", "krishnamurti"] = "lahiri"
    node: Literal["mean", "true"] = "mean"
    at: str | None = None                      # ISO date/time to evaluate dasha and transits (default: now)

    @field_validator("date")
    @classmethod
    def _date(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("date must look like 1990-08-15")
        dt.date.fromisoformat(v)
        if not (1800 <= int(v[:4]) <= 2100):
            raise ValueError("year must be between 1800 and 2100")
        return v

    @field_validator("time")
    @classmethod
    def _time(cls, v: str) -> str:
        if not re.fullmatch(r"\d{1,2}:\d{2}", v):
            raise ValueError("time must look like 06:30")
        h, m = (int(x) for x in v.split(":"))
        if h > 23 or m > 59:
            raise ValueError("time is not valid")
        return v


def _at(b: Birth) -> dt.datetime:
    if not b.at:
        return dt.datetime.now(dt.timezone.utc)
    try:
        d = dt.datetime.fromisoformat(b.at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "`at` must be an ISO date like 2026-11-02 or 2026-11-02T10:30:00Z")
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def _versions() -> dict[str, str]:
    import importlib.metadata as m
    out = {}
    for p in ("pyswisseph", "kerykeion", "fastapi"):
        try:
            out[p] = m.version(p)
        except Exception:
            out[p] = "not installed"
    return out


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "ephemeris": vedic.EPH_NAME, "keyConfigured": bool(ENGINE_KEY), "versions": _versions()}


@app.post("/chart", dependencies=[Depends(require_key)])
def chart(b: Birth) -> dict[str, Any]:
    at = _at(b)
    c = vedic.build_chart(b.date, b.time, b.tz_hours, b.lat, b.lon, b.ayanamsa, b.node, at)
    t = vedic.transit_snapshot(at, c, b.ayanamsa, b.node)
    return {"ok": True, "chart": c, "transits": t, "facts": vedic.facts_text(c, t)}


@app.post("/transits", dependencies=[Depends(require_key)])
def transits(b: Birth) -> dict[str, Any]:
    at = _at(b)
    c = vedic.build_chart(b.date, b.time, b.tz_hours, b.lat, b.lon, b.ayanamsa, b.node, at)
    return {"ok": True, **vedic.transit_snapshot(at, c, b.ayanamsa, b.node)}


def _subject(b: Birth):
    from kerykeion import AstrologicalSubjectFactory as F
    u = vedic.to_utc(b.date, b.time, b.tz_hours)           # Kerykeion gets UTC, so the birth time zone never matters
    mode = {"lahiri": "LAHIRI", "raman": "RAMAN", "krishnamurti": "KRISHNAMURTI"}[b.ayanamsa]
    return F.from_birth_data(b.name, u.year, u.month, u.day, u.hour, u.minute, lng=b.lon, lat=b.lat, tz_str="UTC", online=False,
                             zodiac_type="Sidereal", sidereal_mode=mode, houses_system_identifier="W")


@app.post("/western-aspects", dependencies=[Depends(require_key)])
def western_aspects(b: Birth) -> dict[str, Any]:
    try:
        from kerykeion import AspectsFactory
        a = AspectsFactory.single_chart_aspects(_subject(b))
    except Exception as e:                                   # Kerykeion is an extra; never break the main chart
        raise HTTPException(502, f"Kerykeion could not compute aspects: {str(e)[:160]}")
    rows = [{"p1": x.p1_name, "p2": x.p2_name, "aspect": x.aspect, "orb": round(x.orbit, 2)} for x in a.aspects]
    return {"ok": True, "aspects": rows}


@app.post("/wheel", dependencies=[Depends(require_key)])
def wheel(b: Birth) -> dict[str, Any]:
    """Kerykeion chart wheel as a small SVG, returned base64 so the browser can show it as an <img> (no scripts can run)."""
    try:
        from kerykeion import ChartDataFactory, ChartDrawer
        svg = ChartDrawer(chart_data=ChartDataFactory.create_natal_chart_data(_subject(b))).generate_wheel_only_svg_string()
    except Exception as e:
        raise HTTPException(502, f"Kerykeion could not draw the chart: {str(e)[:160]}")
    if len(svg) > 900_000:
        raise HTTPException(502, "Chart picture is too large.")
    return {"ok": True, "svg_base64": base64.b64encode(svg.encode()).decode()}
