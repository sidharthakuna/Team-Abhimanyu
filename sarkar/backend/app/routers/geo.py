"""
Geo endpoints: reverse-geocoding (lat/long -> readable place name) and
AQI forecast, both backed by the service functions already written in
forecast_geocode.py. Those functions existed but were never mounted on
a router, so the frontend had nothing to call — this file is that
missing wiring.

Mirrors the router pattern used in reports.py / verification.py:
one APIRouter with a prefix, registered in main.py the same way.
"""
import logging
from fastapi import APIRouter, HTTPException, Query

from app.schemas.geo import PlaceNameOut, ForecastOut
from app.services.forecast_geocode import get_aqi_forecast, reverse_geocode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/geo", tags=["geo"])


@router.get("/reverse", response_model=PlaceNameOut)
def reverse_geocode_endpoint(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    """
    GET /api/geo/reverse?latitude=..&longitude=..

    Turns coordinates into a human-readable place name via Nominatim.
    Returns is_live=False (rather than a 502/500) when the upstream call
    fails, so the frontend can fall back to showing raw coordinates
    instead of breaking the form — same fail-soft contract as
    get_live_environment_reading in weather.py.
    """
    result = reverse_geocode(latitude, longitude)
    return PlaceNameOut(display_name=result.display_name, is_live=result.is_live)


@router.get("/forecast", response_model=ForecastOut)
def aqi_forecast_endpoint(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    hours: int = Query(24, ge=1, le=72),
):
    """
    GET /api/geo/forecast?latitude=..&longitude=..&hours=24

    Hourly PM2.5 + European AQI forecast, exposed the same way as the
    reverse-geocode endpoint above. hours is capped at 72 since
    get_aqi_forecast only ever requests forecast_days=3 from Open-Meteo
    (see forecast_geocode.py) — asking for more than that would silently
    return fewer points than requested rather than erroring, so the cap
    here makes that limit explicit instead of surprising.
    """
    result = get_aqi_forecast(latitude, longitude, hours=hours)
    if not result.is_live:
        # Distinguish "upstream failed" from "no data for this range" —
        # a 200 with is_live=False would let the frontend silently chart
        # an empty forecast without knowing why. reports.py/verification.py
        # both prefer explicit HTTPExceptions over swallowed failures for
        # anything the frontend needs to react to (see e.g. the 409 in
        # reports.py's transaction function), so this follows that.
        raise HTTPException(
            status_code=502,
            detail="Forecast temporarily unavailable — Open-Meteo did not respond.",
        )
    return ForecastOut(
        points=[p._asdict() for p in result.points],
        is_live=result.is_live,
    )