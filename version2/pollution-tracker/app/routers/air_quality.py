"""
Air quality risk endpoint.

Returns TWO independent signals side by side, deliberately not blended:

1. citizen_report_risk — your own heuristic derived from nearby citizen
   reports (see app/services/air_quality_risk.py).
2. govt_air_quality — an external, government-adjacent modeled estimate
   from OpenWeatherMap (see app/services/govt_air_quality.py, including
   that file's docstring on exactly what this data source is and isn't).

Kept separate rather than combined into one score so each remains
independently explainable — "why is this number X" always has exactly
one cause. If govt_air_quality is unavailable (key not configured, OWM
call failed), that field is returned with available=false rather than
failing the whole endpoint — the citizen-report signal still works on
its own, same non-fatal-degradation pattern already used for geocoding
failures elsewhere in this app.

On-demand check: the frontend calls this when the citizen opens the
report form with a known location, and can show a warning banner using
either or both signals. Not a background job or push notification
system in this version.
"""
import logging

from fastapi import APIRouter, Depends, Query
from google.cloud import firestore

from app.core.database import get_db
from app.schemas.report import AirQualityRiskResult, CombinedAirQualityOut, GovtAirQualityOut
from app.services.air_quality_risk import assess_risk
from app.services.govt_air_quality import GovtAirQualityError, get_air_quality

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/air-quality", tags=["air-quality"])


@router.get("/risk", response_model=CombinedAirQualityOut)
def get_air_quality_risk(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    db: firestore.Client = Depends(get_db),
):
    citizen_result = assess_risk(db, latitude, longitude)
    citizen_out = AirQualityRiskResult(
        risk_score=citizen_result.risk_score,
        should_warn=citizen_result.should_warn,
        contributing_reports=citizen_result.contributing_reports,
        explanation=citizen_result.explanation,
    )

    govt_out: GovtAirQualityOut | None = None
    try:
        govt_result = get_air_quality(latitude, longitude)
        govt_out = GovtAirQualityOut(
            owm_aqi_index=govt_result.owm_aqi_index,
            owm_aqi_label=govt_result.owm_aqi_label,
            approx_cpcb_style_score=govt_result.approx_cpcb_style_score,
            dominant_pollutant=govt_result.dominant_pollutant,
            pollutant_concentrations=govt_result.pollutant_concentrations,
            source=govt_result.source,
            available=True,
        )
    except GovtAirQualityError as e:
        logger.warning("Govt air quality unavailable for (%.5f, %.5f): %s", latitude, longitude, e)
        govt_out = GovtAirQualityOut(
            owm_aqi_index=0,
            owm_aqi_label="Unavailable",
            approx_cpcb_style_score=0,
            dominant_pollutant="unknown",
            pollutant_concentrations={},
            source="OpenWeatherMap Air Pollution API",
            available=False,
        )

    return CombinedAirQualityOut(citizen_report_risk=citizen_out, govt_air_quality=govt_out)