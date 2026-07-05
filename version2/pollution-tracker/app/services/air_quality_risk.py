"""
Air quality risk heuristic.

WHY THIS DOESN'T CALL GEMINI: this was explicitly considered and rejected.
"Should someone avoid this area right now" from "previous data" is a
numeric aggregation problem (how many recent severe air-quality reports
are nearby, and how recent are they), not a language understanding
problem. Handing that to an LLM would mean:
  - paying for a model call that does arithmetic worse than arithmetic
  - getting back prose that HAS to be re-parsed into a boolean/score
    anyway for the frontend to render a warning badge
  - the model inventing a confidence-sounding number with no real
    statistical grounding, which is a worse failure mode for a safety
    warning than an honestly-labeled heuristic

This function is a plain weighted score instead: transparent, fast, free,
and "we compute a risk score from report density, severity, and recency
within a radius" is a sentence you can actually defend to a judge who
asks "how does that work?" It is NOT a real air-quality prediction model
— it's a proxy signal from citizen-reported data, and the response makes
that explicit rather than dressing it up as more than it is.

WHERE THIS COULD GO NEXT: swap or blend in a real CPCB (Central
Pollution Control Board) feed if/when there's time to validate that
API's actual shape. This function's signature (lat, lng -> RiskAssessment)
is intentionally the seam where that would plug in: a second scoring
function reading CPCB data could be averaged with this one, or preferred
when available and fallback to this one when it's not.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from google.cloud import firestore

from app.core.config import settings
from app.models.report import IssueCategory, Report
from app.services import firestore_repo

logger = logging.getLogger(__name__)

# Categories that meaningfully bear on air quality. Garbage/sewage can
# correlate with air quality (odor, off-gassing) but we deliberately keep
# this narrow and defensible rather than stretching the signal thin.
_AIR_QUALITY_CATEGORIES = [IssueCategory.air_pollution, IssueCategory.industrial_waste]

# Same base weights used for cluster severity, reused here so "how bad is
# this category" is answered consistently in one place rather than
# invented twice with different numbers.
_CATEGORY_WEIGHT = settings.SEVERITY_BASE_WEIGHTS


@dataclass
class RiskAssessment:
    risk_score: int  # 0-100, same scale as cluster severity_score
    should_warn: bool
    contributing_reports: int
    explanation: str


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # Imported directly rather than reimplemented, so the two copies
    # can't ever drift apart.
    from app.services.clustering import _haversine_meters as haversine
    return haversine(lat1, lon1, lat2, lon2)


def _recency_weight(report_created_at: datetime, now: datetime, window_hours: float) -> float:
    """
    Linear decay from 1.0 (just now) to 0.0 (at the edge of the window).
    A report from an hour ago should count for more than one from six
    days ago even if both are inside the window — this avoids a sharp
    cliff at the window edge and better reflects that air quality
    conditions from a week ago say less about right now than from
    yesterday.
    """
    age_hours = (now - report_created_at).total_seconds() / 3600
    if age_hours < 0:
        age_hours = 0  # defensive: clock skew shouldn't produce weight > 1
    fraction_remaining = max(0.0, 1.0 - (age_hours / window_hours))
    return fraction_remaining


def assess_risk(db: firestore.Client, latitude: float, longitude: float) -> RiskAssessment:
    """
    Computes a risk score for a given point based on recent nearby
    air-quality-relevant reports. Called on-demand when a citizen opens
    the report form with a known location (see routers/air_quality.py) —
    NOT run as a background job or push notification in this version.
    """
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=settings.AIR_QUALITY_RISK_WINDOW_HOURS)

    candidate_reports = firestore_repo.list_recent_reports_by_categories(
        db, _AIR_QUALITY_CATEGORIES, window_start
    )

    nearby_reports: list[Report] = [
        r for r in candidate_reports
        if _haversine_meters(latitude, longitude, r.latitude, r.longitude)
        <= settings.AIR_QUALITY_RISK_RADIUS_METERS
    ]

    if not nearby_reports:
        return RiskAssessment(
            risk_score=0,
            should_warn=False,
            contributing_reports=0,
            explanation="No recent air-quality-relevant reports found nearby.",
        )

    total_weighted_score = 0.0
    for report in nearby_reports:
        base = _CATEGORY_WEIGHT.get(report.category.value, 25)
        recency = _recency_weight(report.created_at, now, settings.AIR_QUALITY_RISK_WINDOW_HOURS)
        # ai_confidence factors in here so a low-confidence classification
        # (Gemini or mock unsure it's really air_pollution) contributes
        # less than a high-confidence one, rather than being trusted
        # equally.
        confidence = report.ai_confidence if report.ai_confidence is not None else 0.5
        total_weighted_score += base * recency * confidence

    # Average rather than sum, so one old severe report near a hundred
    # unrelated new light ones doesn't get diluted to nothing, but also
    # so ten reports of the same single ongoing incident don't compound
    # into an unrealistic score the way a naive sum would. This is a
    # judgment call, not a derived formula — flagging that explicitly
    # since it's the one place in this function that isn't just "count
    # and weight what's there."
    average_score = total_weighted_score / len(nearby_reports)

    # Small bonus for multiple independent contributing reports, mirroring
    # the same "3+ reports = more confidence" idea used in cluster
    # severity scoring, capped so it can't alone push a low base score
    # into warning territory.
    corroboration_bonus = min(len(nearby_reports) * 2, 15)

    risk_score = min(int(round(average_score + corroboration_bonus)), 100)
    should_warn = risk_score >= settings.AIR_QUALITY_RISK_WARNING_THRESHOLD

    explanation = (
        f"Based on {len(nearby_reports)} air-quality-relevant report(s) within "
        f"{int(settings.AIR_QUALITY_RISK_RADIUS_METERS)}m over the last "
        f"{int(settings.AIR_QUALITY_RISK_WINDOW_HOURS)} hours. This is a heuristic "
        f"derived from citizen reports, not a certified air quality measurement."
    )

    logger.info(
        "Air quality risk at (%.5f, %.5f): score=%d warn=%s reports=%d",
        latitude, longitude, risk_score, should_warn, len(nearby_reports),
    )

    return RiskAssessment(
        risk_score=risk_score,
        should_warn=should_warn,
        contributing_reports=len(nearby_reports),
        explanation=explanation,
    )
