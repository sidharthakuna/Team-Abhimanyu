"""
Pydantic schemas — these define the exact JSON shape going in and out of
every endpoint. This IS the API contract. If frontend and backend both
build against this file, they won't drift apart.

Naming convention: `XCreate` for what the client sends to create X,
`XOut` for what the server sends back, `XUpdate` for partial updates.
"""
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, computed_field
from app.models.report import IssueCategory, PhotoType, ReportStatus, VerificationStatus
from app.core.config import settings


# ---------- Report ----------

class ReportCreate(BaseModel):
    """
    What the citizen upload form sends. The photo itself is sent as
    multipart/form-data (see the router), not in this JSON body — this
    schema covers the accompanying fields.

    address is optional and typically only present when the frontend
    used "use my current location" + reverse geocoding to pre-fill it;
    a citizen typing a manual description may leave it blank.
    """
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    description: Optional[str] = None
    address: Optional[str] = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cluster_id: str
    photo_url: str
    after_photo_url: Optional[str]
    latitude: float
    longitude: float
    address: Optional[str]
    description: Optional[str]
    category: IssueCategory
    ai_confidence: Optional[float]
    is_duplicate_of_cluster: bool
    created_at: datetime


# ---------- Cluster (what the dashboard actually renders) ----------

class ClusterOut(BaseModel):
    """
    resolved_at was added to the underlying Cluster model (see
    app/models/report.py) to support the "green marker fades after N
    seconds" behavior. It's included directly here — not just on the
    ClusterOutWithFade subclass below — so ANY endpoint returning a
    ClusterOut (list_clusters, get_cluster, update_cluster_status, etc.)
    exposes the raw timestamp. ClusterOutWithFade adds the CONVENIENCE
    computed fields on top for callers who don't want to do the
    timestamp math themselves.
    """
    model_config = ConfigDict(from_attributes=True)

    id: str
    latitude: float
    longitude: float
    category: IssueCategory
    severity_score: int
    status: ReportStatus
    assigned_department: Optional[str]
    verification_status: VerificationStatus
    verification_confidence: Optional[float]
    municipal_summary: Optional[str]
    report_count: int
    resolved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ClusterStatusUpdate(BaseModel):
    status: ReportStatus


# ---------- Verification (before/after) ----------

class VerificationResult(BaseModel):
    verification_status: VerificationStatus
    confidence: float
    explanation: str


# ---------- Map markers (before/after red/green dots) ----------

class MapMarkerOut(BaseModel):
    """
    One pin for the municipal worker's map. photo_type determines the
    frontend's dot color: 'before' (unresolved, no verified after-photo
    yet) renders red, 'after' (verification submitted and confirmed
    resolved) renders green. See routers/reports.py's
    get_cluster_map_markers for how these are assembled — a single
    cluster can produce up to two markers (one for the original photo,
    one for the after-photo, if submitted).
    """
    cluster_id: str
    report_id: str
    photo_type: PhotoType
    photo_url: str
    latitude: float
    longitude: float
    category: IssueCategory
    status: ReportStatus
    verification_status: VerificationStatus
    address: Optional[str]


# ---------- Geocoding ----------

class ReverseGeocodeRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class ReverseGeocodeResult(BaseModel):
    address: str


# ---------- Air quality risk ----------
#
# NOTE: there is deliberately no AirQualityRiskRequest body-model here.
# routers/air_quality.py takes latitude/longitude as Query(...) params
# directly, not a request body, so a body-model schema would be dead
# code that nothing constructs or validates against — removed for
# exactly that reason (see bug #6 in the audit this file's history
# refers to). If a request-body version of this endpoint is ever
# needed, redefine it then, next to the endpoint that actually uses it.

class AirQualityRiskResult(BaseModel):
    risk_score: int = Field(..., ge=0, le=100)
    should_warn: bool
    contributing_reports: int
    explanation: str


# ---------- Government/external air quality (OpenWeatherMap) ----------

class GovtAirQualityOut(BaseModel):
    """
    Shown ALONGSIDE (not blended into) the citizen-report-derived
    AirQualityRiskResult — see routers/air_quality.py. Kept as an
    independently explainable signal rather than merged into one score.
    """
    owm_aqi_index: int
    owm_aqi_label: str
    approx_cpcb_style_score: int = Field(..., ge=0, le=100)
    dominant_pollutant: str
    pollutant_concentrations: dict[str, float]
    source: str
    available: bool = True  # false when OWM call failed/not configured — frontend shows this signal as unavailable rather than omitting the key entirely


class CombinedAirQualityOut(BaseModel):
    """
    Full response shape for GET /api/air-quality/risk: your own
    citizen-report risk score, plus the independent OpenWeatherMap
    signal, side by side.
    """
    citizen_report_risk: AirQualityRiskResult
    govt_air_quality: Optional[GovtAirQualityOut]


# ---------- Resolved-marker fade window ----------

class ClusterOutWithFade(ClusterOut):
    """
    Extends ClusterOut with computed fields the frontend can read
    directly, instead of parsing resolved_at and doing timestamp math
    client-side. Both fields are Pydantic `computed_field`s, meaning
    they're derived automatically from resolved_at every time this
    model is serialized — there's no separate step to "remember" to
    populate them, and they can never drift out of sync with
    resolved_at the way a manually-set field could.

    should_still_display is the frontend's actual cue to stop rendering
    a marker: check this boolean before showing anything, rather than
    comparing seconds_since_resolved against the threshold yourself
    (seconds_since_resolved is exposed mainly for debugging/display,
    e.g. "resolved 12s ago").

    NOT swapped in as the default ClusterOut response model everywhere
    — wire this in wherever the map-facing endpoints
    (list_clusters/get_cluster/get_cluster_map_markers) need it, since
    those are the ones a poller would call repeatedly to check whether
    a green marker should still show.
    """

    @computed_field
    @property
    def seconds_since_resolved(self) -> Optional[float]:
        if self.resolved_at is None:
            return None
        resolved_at = self.resolved_at
        if resolved_at.tzinfo is None:
            # Defensive: Firestore round-trips should always come back
            # tz-aware (see Cluster.created_at/updated_at using
            # datetime.now(timezone.utc) throughout this codebase), but
            # guard here rather than let a naive/aware subtraction raise
            # if that ever isn't true.
            resolved_at = resolved_at.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - resolved_at).total_seconds()

    @computed_field
    @property
    def should_still_display(self) -> bool:
        if self.status != ReportStatus.resolved or self.resolved_at is None:
            # Not resolved at all -> always display (this field's whole
            # purpose is the fade-out window for RESOLVED clusters; a
            # pending/assigned cluster's marker visibility isn't this
            # field's concern).
            return True
        seconds = self.seconds_since_resolved
        return seconds is not None and seconds < settings.RESOLVED_MARKER_DISPLAY_SECONDS