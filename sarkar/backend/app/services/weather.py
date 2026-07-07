"""
Live weather + air quality service — Open-Meteo (no API key required).

Two endpoints are called per request:
  - Weather Forecast API  -> temperature, relative humidity
  - Air Quality API       -> PM2.5, PM10, European AQI

Both are free for non-commercial use and require no signup or key.
Attribution requirement (per Open-Meteo's terms): any UI displaying this
data must credit CAMS and Open-Meteo. See ATTRIBUTION_TEXT below — the
frontend renders this string as-is; do not remove it from the response.

Data source: Copernicus Atmosphere Monitoring Service (CAMS), served via
Open-Meteo. ~11km resolution for Europe, ~45km globally (India falls
under the global CAMS domain, not the higher-res European one).
"""
import logging
import requests
from typing import Optional, NamedTuple

logger = logging.getLogger(__name__)

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

REQUEST_TIMEOUT_SECONDS = 6

ATTRIBUTION_TEXT = (
    "Air quality: CAMS (Copernicus Atmosphere Monitoring Service) via Open-Meteo.com"
)


class LiveEnvironmentReading(NamedTuple):
    temperature_c: Optional[float]
    humidity_pct: Optional[float]
    pm2_5: Optional[float]
    pm10: Optional[float]
    european_aqi: Optional[int]
    data_source: str
    is_live: bool  # False if any upstream call failed and this is a fallback


def _fetch_weather(latitude: float, longitude: float) -> dict:
    """Calls Open-Meteo's Weather Forecast API for current temp + humidity."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m",
        "timezone": "auto",
    }
    resp = requests.get(WEATHER_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    resp.raise_for_status()
    return resp.json()


def _fetch_air_quality(latitude: float, longitude: float) -> dict:
    """Calls Open-Meteo's Air Quality API for current PM2.5, PM10, and AQI."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "pm2_5,pm10,european_aqi",
        "timezone": "auto",
    }
    resp = requests.get(AIR_QUALITY_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    resp.raise_for_status()
    return resp.json()


def get_live_environment_reading(latitude: float, longitude: float) -> LiveEnvironmentReading:
    """
    Fetches real, location-specific weather + air quality for the given
    coordinates. This is what should back every "live" reading shown in
    the UI — no hardcoded constants.

    If either upstream call fails (network issue, Open-Meteo downtime),
    returns is_live=False so the frontend can show an honest "data
    temporarily unavailable" state instead of silently displaying a
    stale or fabricated number.
    """
    temperature_c = None
    humidity_pct = None
    pm2_5 = None
    pm10 = None
    european_aqi = None
    is_live = True

    try:
        weather_data = _fetch_weather(latitude, longitude)
        current = weather_data.get("current", {})
        temperature_c = current.get("temperature_2m")
        humidity_pct = current.get("relative_humidity_2m")
    except requests.RequestException as e:
        logger.warning("Open-Meteo weather fetch failed for (%s, %s): %s", latitude, longitude, e)
        is_live = False

    try:
        aq_data = _fetch_air_quality(latitude, longitude)
        current = aq_data.get("current", {})
        pm2_5 = current.get("pm2_5")
        pm10 = current.get("pm10")
        european_aqi = current.get("european_aqi")
    except requests.RequestException as e:
        logger.warning("Open-Meteo air quality fetch failed for (%s, %s): %s", latitude, longitude, e)
        is_live = False

    return LiveEnvironmentReading(
        temperature_c=temperature_c,
        humidity_pct=humidity_pct,
        pm2_5=pm2_5,
        pm10=pm10,
        european_aqi=european_aqi,
        data_source="Open-Meteo (CAMS)" if is_live else "unavailable",
        is_live=is_live,
    )