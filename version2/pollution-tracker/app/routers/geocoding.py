"""
Reverse geocoding router. Thin wrapper — actual provider logic lives in
app/services/geocoding.py (see that file's docstring for why Nominatim
was chosen over Google's Geocoding API).
"""
import logging

from fastapi import APIRouter, HTTPException, Query

from app.schemas.report import ReverseGeocodeResult
from app.services.geocoding import GeocodingError, reverse_geocode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/geocoding", tags=["geocoding"])


@router.get("/reverse", response_model=ReverseGeocodeResult)
def get_reverse_geocode(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    """
    Used by the frontend's "use my current location" flow to pre-fill
    a human-readable address (see ReportCreate.address's docstring in
    schemas/report.py). A citizen typing a manual address never calls
    this.

    Returns 502 (not 500) if Nominatim is unreachable or has no result —
    same pattern as upstream_http_error_handler in main.py, so the
    frontend can treat this the same way it already treats a failed
    Cloudinary call: show the form without a pre-filled address rather
    than blocking submission entirely.
    """
    try:
        return reverse_geocode(latitude, longitude)
    except GeocodingError as e:
        logger.warning("Reverse geocode failed for (%.5f, %.5f): %s", latitude, longitude, e)
        raise HTTPException(status_code=502, detail=str(e)) from e