"""
Air pollution index via OpenWeatherMap's Air Pollution API.

WHY THIS EXISTS SEPARATELY FROM app/services/air_quality_risk.py:
that file computes a risk score from YOUR OWN citizen reports (density,
severity, recency of things people have actually reported nearby). This
file is a completely independent second signal: what does an external,
government-adjacent atmospheric model say about this exact point right
now, regardless of whether anyone has reported anything there. The two
are deliberately kept as separate, individually-explainable numbers
rather than blended into one score — see the docstring on
assess_risk() in air_quality_risk.py for why "one number with two
tangled causes" is harder to defend to a judge than two clear ones
shown side by side. routers/air_quality.py returns both.

DATA SOURCE HONESTY: OpenWeatherMap's Air Pollution API is a MODELED /
INTERPOLATED estimate (calibrated against ground stations, which
include CPCB's among others worldwide), not a direct live read from a
CPCB sensor. It has full lat/lng grid coverage — unlike CPCB's own
station-based feed, which only has real data at a few hundred fixed
points nationwide and would return "no nearby station" for most
coordinates. That coverage guarantee is why this was chosen over
building directly against CPCB/data.gov.in for the hackathon. If asked
directly: "this is a global atmospheric model calibrated against
ground stations, not a raw government sensor feed" is the accurate
one-sentence answer — say that rather than imply it's raw CPCB data.

SCALE CONVERSION: OpenWeatherMap returns its own 1-5 Air Quality Index,
NOT India's CPCB 0-500 AQI scale that Indian news/government
communication uses. These are genuinely different scales measuring
different things (OWM's is a coarse 5-bucket categorical index; CPCB's
is a continuous 0-500 index with its own sub-index-per-pollutant
methodology) — there is no exact mathematical conversion between them.
_owm_to_cpcb_style_score() below produces a labeled APPROXIMATION for
display purposes only, clearly documented as such rather than
presented as a precise conversion.
"""
import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_OWM_ENDPOINT = "https://api.openweathermap.org/data/2.5/air_pollution"

# In-memory cache: {(lat_rounded, lon_rounded): (timestamp, GovtAirQualityResult)}
# Rounding to ~1km precision so nearby report-form loads within the same
# neighborhood share a cache entry instead of each missing it by a
# few decimal places of GPS jitter. Plain dict is fine for hackathon
# scale / single-process deployment; would need a real cache (Redis)
# behind more than one server process.
_cache: dict[tuple[float, float], tuple[float, "GovtAirQualityResult"]] = {}


class GovtAirQualityError(Exception):
    """Raised when the OpenWeatherMap call fails or the key isn't configured."""


@dataclass
class GovtAirQualityResult:
    owm_aqi_index: int  # OpenWeatherMap's own 1-5 scale, raw and unconverted
    owm_aqi_label: str  # "Good" / "Fair" / "Moderate" / "Poor" / "Very Poor"
    approx_cpcb_style_score: int  # 0-100 APPROXIMATION for display alongside your own risk_score — see module docstring
    dominant_pollutant: str
    pollutant_concentrations: dict[str, float]  # raw µg/m³ values, e.g. {"pm2_5": 34.2, "pm10": 58.1, ...}
    source: str = "OpenWeatherMap Air Pollution API (modeled estimate, not a direct government sensor reading)"


# OWM's 1-5 index labels, straight from their documented scale.
_OWM_LABELS = {1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor"}

# Rough midpoint mapping from OWM's 5-bucket index to a comparable 0-100
# display score, so it visually sits on roughly the same axis as your
# own risk_score in the UI. This is a labeled approximation, not a
# scientific conversion — see module docstring. Buckets chosen so
# "Moderate" (3) lands near the middle of the range rather than being
# skewed to either end.
_OWM_TO_APPROX_SCORE = {1: 10, 2: 30, 3: 50, 4: 75, 5: 95}


def _owm_to_cpcb_style_score(owm_index: int) -> int:
    return _OWM_TO_APPROX_SCORE.get(owm_index, 50)


# WHO/CPCB-style reference thresholds (µg/m³) used ONLY to normalize
# pollutants onto a comparable scale for picking a "dominant" one — NOT
# used anywhere else in scoring. Raw concentration alone is misleading
# here: CO's ambient values are naturally ~100x larger than PM2.5's
# just from unit/chemistry differences, so comparing raw numbers picks
# CO as "dominant" almost every time regardless of actual air quality,
# even when the overall OWM index says "Good." Dividing each pollutant
# by a reference threshold gives "how much of a bad day is this
# pollutant having, relative to its own normal range" instead, which
# is comparable across pollutant types. These are rough reference
# points for normalization purposes, not exact regulatory limits —
# don't present them to a judge as official cutoffs, they're a display
# heuristic the same way approx_cpcb_style_score is.
_POLLUTANT_REFERENCE_THRESHOLD = {
    "pm2_5": 60.0,   # WHO interim target / CPCB 24hr-ish reference
    "pm10": 100.0,
    "no2": 80.0,
    "o3": 100.0,
    "so2": 80.0,
    "co": 4000.0,    # CO's safe range is genuinely much higher in µg/m³
}


def _pick_dominant_pollutant(components: dict[str, float]) -> str:
    """
    Picks the pollutant that's proportionally furthest into unhealthy
    territory relative to ITS OWN reference threshold, not the one with
    the biggest raw number. See _POLLUTANT_REFERENCE_THRESHOLD comment
    for why raw-value comparison across different pollutants is
    misleading (e.g. CO's raw µg/m³ values dwarf PM2.5's even on a
    "Good" air quality day, purely from unit scale, not actual harm).

    NH3 is deliberately excluded from the threshold table (and therefore
    can never be picked as dominant) since ammonia readings are rarely
    what a citizen-facing pollution alert should lead with — kept
    consistent with the categories this module was already treating as
    "relevant for dominant" before this fix.
    """
    ratios = {
        k: components[k] / _POLLUTANT_REFERENCE_THRESHOLD[k]
        for k in _POLLUTANT_REFERENCE_THRESHOLD
        if k in components
    }
    if not ratios:
        return "unknown"
    return max(ratios, key=ratios.get)


def _round_for_cache(latitude: float, longitude: float) -> tuple[float, float]:
    # ~2 decimal places is roughly 1.1km at the equator, close enough
    # for "same neighborhood" caching without being so coarse it merges
    # genuinely different areas.
    return (round(latitude, 2), round(longitude, 2))


def get_air_quality(latitude: float, longitude: float) -> GovtAirQualityResult:
    """
    Fetches (or returns a cached) air pollution reading for a point.

    Raises GovtAirQualityError if the key isn't configured or the
    request fails — callers (see routers/air_quality.py) should catch
    this and degrade gracefully (omit this signal from the response
    rather than failing the whole endpoint), the same pattern already
    used for GeocodingError elsewhere in this codebase.
    """
    if not settings.OWM_CONFIGURED:
        raise GovtAirQualityError(
            "OPENWEATHERMAP_API_KEY is not set. Add it to .env. Get a free "
            "key from openweathermap.org -> sign up -> API keys tab. Note: "
            "a newly created key can take up to a couple hours to activate."
        )

    cache_key = _round_for_cache(latitude, longitude)
    cached = _cache.get(cache_key)
    if cached is not None:
        cached_at, result = cached
        if time.monotonic() - cached_at < settings.OWM_CACHE_TTL_SECONDS:
            return result

    params = {
        "lat": latitude,
        "lon": longitude,
        "appid": settings.OPENWEATHERMAP_API_KEY,
    }

    try:
        response = httpx.get(_OWM_ENDPOINT, params=params, timeout=5.0)
        response.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("OpenWeatherMap air pollution request failed: %s", e)
        raise GovtAirQualityError(f"OpenWeatherMap request failed: {e}") from e

    data = response.json()

    try:
        entry = data["list"][0]
        owm_index = int(entry["main"]["aqi"])
        components: dict[str, float] = entry["components"]
    except (KeyError, IndexError, ValueError, TypeError) as e:
        logger.warning("OpenWeatherMap response didn't match expected shape: %s | raw: %s", e, data)
        raise GovtAirQualityError("OpenWeatherMap returned an unexpected response shape.") from e

    dominant_pollutant = _pick_dominant_pollutant(components)

    result = GovtAirQualityResult(
        owm_aqi_index=owm_index,
        owm_aqi_label=_OWM_LABELS.get(owm_index, "Unknown"),
        approx_cpcb_style_score=_owm_to_cpcb_style_score(owm_index),
        dominant_pollutant=dominant_pollutant,
        pollutant_concentrations=components,
    )

    _cache[cache_key] = (time.monotonic(), result)
    return result