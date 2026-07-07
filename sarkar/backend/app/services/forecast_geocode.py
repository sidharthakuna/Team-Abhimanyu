"""
Two additions to the existing live-data pipeline in weather.py:

1. Air quality FORECAST (not just current) — Open-Meteo's air-quality
   endpoint returns hourly PM2.5/PM10/AQI for the next several days from
   the same call shape you already use in weather.py, just swapping
   `current` for `hourly`. Same no-key, free-tier API you're already on.

2. Reverse geocoding via Nominatim (OpenStreetMap) — turns raw lat/long
   into a human-readable place name ("Banjara Hills, Hyderabad") for
   display in the citizen portal and admin dashboard. Also free, no key,
   but Nominatim's usage policy requires a descriptive User-Agent header
   identifying your app and max ~1 request/second — see
   https://operations.osmfoundation.org/policies/nominatim/

Both fail soft, same pattern as get_live_environment_reading: if the
upstream call errors, return is_live=False / a None name rather than
throwing, so the frontend can show an honest fallback state instead of
crashing the endpoint.
"""
import logging
from typing import Optional, NamedTuple
import requests

logger = logging.getLogger(__name__)

AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"

REQUEST_TIMEOUT_SECONDS = 6

# Nominatim's usage policy requires a real identifying User-Agent — a
# generic 'python-requests/x.x' header gets you rate-limited or blocked.
# Replace the URL below with your actual repo before demo day.
NOMINATIM_HEADERS = {
    "User-Agent": "SaafSarkar-PollutionTracker/1.0 (https://github.com/your-org/saaf-sarkar)"
}


class ForecastPoint(NamedTuple):
    time: str  # ISO timestamp, e.g. "2026-07-06T14:00"
    pm2_5: Optional[float]
    european_aqi: Optional[int]


class ForecastResult(NamedTuple):
    points: list[ForecastPoint]
    is_live: bool


class PlaceName(NamedTuple):
    display_name: Optional[str]  # e.g. "Banjara Hills, Hyderabad, Telangana"
    is_live: bool


def get_aqi_forecast(latitude: float, longitude: float, hours: int = 48) -> ForecastResult:
    """
    Hourly PM2.5 + European AQI forecast for the next `hours` hours at the
    given coordinates. Same Open-Meteo Air Quality API as
    get_live_environment_reading in weather.py — just requesting `hourly`
    instead of `current`.
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "pm2_5,european_aqi",
        "forecast_days": 3,  # Open-Meteo returns in 24h blocks; we slice to `hours` below
        "timezone": "auto",
    }
    try:
        resp = requests.get(AIR_QUALITY_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        resp.raise_for_status()
        data = resp.json()

        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        pm25_values = hourly.get("pm2_5", [])
        aqi_values = hourly.get("european_aqi", [])

        points = [
            ForecastPoint(time=t, pm2_5=pm25_values[i] if i < len(pm25_values) else None,
                          european_aqi=aqi_values[i] if i < len(aqi_values) else None)
            for i, t in enumerate(times[:hours])
        ]
        return ForecastResult(points=points, is_live=True)

    except requests.RequestException as e:
        logger.warning("Open-Meteo forecast fetch failed for (%s, %s): %s", latitude, longitude, e)
        return ForecastResult(points=[], is_live=False)


def reverse_geocode(latitude: float, longitude: float) -> PlaceName:
    """
    Converts lat/long into a readable place name via Nominatim. Returns
    is_live=False on any failure so callers can fall back to showing raw
    coordinates instead of crashing or showing a stale name silently.

    NOTE: Nominatim's usage policy caps this at ~1 req/sec per app and
    requires the User-Agent above. For a hackathon demo this is fine;
    for anything beyond that, cache results per cluster (they rarely
    move) rather than calling this on every page load.
    """
    params = {
        "lat": latitude,
        "lon": longitude,
        "format": "jsonv2",
        "zoom": 14,  # neighbourhood-level, not house-number-level (see zoom table in Nominatim docs)
        "addressdetails": 0,
        # Nominatim's usage policy asks for an email on top of the
        # User-Agent when making more than a handful of requests, so it
        # can identify your traffic if something needs attention. Replace
        # with a real contact before demo day.
        "email": "your-team-email@example.com",
    }
    try:
        resp = requests.get(
            NOMINATIM_URL, params=params, headers=NOMINATIM_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS
        )
        resp.raise_for_status()
        data = resp.json()
        name = data.get("display_name")
        return PlaceName(display_name=name, is_live=True)

    except requests.RequestException as e:
        logger.warning("Nominatim reverse geocode failed for (%s, %s): %s", latitude, longitude, e)
        return PlaceName(display_name=None, is_live=False)