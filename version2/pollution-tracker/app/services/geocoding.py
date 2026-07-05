"""
Reverse geocoding endpoint.

REPLACES Google's Geocoding API with OpenStreetMap's Nominatim — no API
key, no billing account, no credit card required. Trade-off: Nominatim's
usage policy caps free public-instance use at 1 request/second and
requires a real, identifying User-Agent header (an unauthenticated/
generic UA can get silently rate-limited or blocked) — see
https://operations.osmfoundation.org/policies/nominatim/. Fine for a
hackathon demo's request volume; if this app is ever deployed with real
traffic, either self-host Nominatim or move to a paid provider with an
actual SLA.

This mirrors the mock/real pattern already used in classifier.py and
govt_air_quality.py: one function is the single entry point, callers
never need to know which provider answered.

Frontend note: reverse geocoding here is used ONLY for the "use my
current location" flow (see ReportCreate.address's docstring in
schemas/report.py) — a citizen typing a manual address never touches
this endpoint.
"""
import logging

import httpx

from app.core.config import settings
from app.schemas.report import ReverseGeocodeResult

logger = logging.getLogger(__name__)

_NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse"

# Nominatim's policy requires a real identifying User-Agent — a missing
# or generic one (e.g. default httpx/requests UA) risks silent
# rate-limiting or an outright block. Replace the email with a real
# contact if you deploy this beyond local dev; it's what lets OSM's
# maintainers reach you if your usage pattern needs attention, per
# their policy linked above.
_USER_AGENT = "pollution-tracker-hackathon/0.1 (contact: sidharthakuna@gmail.com)"


class GeocodingError(Exception):
    """Raised when the reverse geocoding call fails or returns no result."""


def reverse_geocode(latitude: float, longitude: float) -> ReverseGeocodeResult:
    """
    Single entry point used by the router. Raises GeocodingError on any
    failure — callers should catch this and degrade gracefully (e.g.
    return address=None, same non-fatal-degradation pattern used for
    govt_air_quality elsewhere in this codebase), rather than let it
    surface as an unhandled 500.
    """
    params = {
        "lat": latitude,
        "lon": longitude,
        "format": "jsonv2",
        "zoom": 18,          # building/address-level detail, not just city/region
        "addressdetails": 1,
    }
    headers = {"User-Agent": _USER_AGENT}

    try:
        response = httpx.get(_NOMINATIM_ENDPOINT, params=params, headers=headers, timeout=5.0)
        response.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("Nominatim reverse geocode request failed: %s", e)
        raise GeocodingError(f"Reverse geocoding request failed: {e}") from e

    data = response.json()

    if "error" in data or "display_name" not in data:
        # Nominatim returns HTTP 200 with an "error" key (e.g. for
        # coordinates in open ocean with no nearby address) rather than
        # a 4xx/5xx — this is a legitimate "no result" case, not a
        # transport failure, but callers still need to treat it as
        # "geocoding didn't work" either way.
        logger.info("Nominatim returned no address for (%.5f, %.5f): %s", latitude, longitude, data)
        raise GeocodingError("No address found for these coordinates.")

    return ReverseGeocodeResult(address=data["display_name"])