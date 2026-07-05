"""
Core data models.

MIGRATION NOTE (2026-07-04): these were SQLAlchemy ORM classes
(Column, relationship, etc.) backed by Postgres tables. They're now plain
dataclasses that represent the shape of a Firestore document. Firestore
itself is schemaless — nothing here is enforced by the database, it's
enforced by us being disciplined about going through these dataclasses
and the repo functions in app/services/firestore_repo.py rather than
writing raw dicts to Firestore ad hoc.

Two "collections" (Firestore's rough equivalent of tables):
- clusters: a group of reports that are likely the same real-world
  incident (same location + time window). Powers duplicate detection.
  NOTE: fire reports deliberately bypass this grouping — see
  services/clustering.py's create_fire_report() and the module-level
  note there on why every fire report gets its own standalone cluster
  rather than being matched into an existing one.
- reports: a single citizen submission. Stores cluster_id as a plain
  string field (Firestore has no foreign keys or JOINs — see
  firestore_repo.py for how we fetch a cluster's reports).

If you need to add a field (e.g. a new report status), add it to the
relevant Enum or dataclass here. No migration step needed — Firestore
documents written before your change simply won't have the new field
until they're next updated; give new fields sensible defaults in
`from_dict()` to handle that.
"""
import enum
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


class IssueCategory(str, enum.Enum):
    garbage = "garbage"
    water_pollution = "water_pollution"
    air_pollution = "air_pollution"
    industrial_waste = "industrial_waste"
    sewage = "sewage"
    fire = "fire"
    other = "other"

    @property
    def is_emergency(self) -> bool:
        """
        True for categories that require immediate, standalone dispatch
        rather than the standard cluster-and-confirm pollution workflow.
        Checked in services/clustering.py and services/severity.py to
        branch into the emergency path. Centralizing this as a property
        on the enum (rather than an `if category == IssueCategory.fire`
        check scattered across files) means adding a second emergency
        category later is a one-line change here, not a multi-file hunt.
        """
        return self in (IssueCategory.fire,)


class ReportStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    resolved = "resolved"


class VerificationStatus(str, enum.Enum):
    not_submitted = "not_submitted"    # no after-photo yet
    pending_review = "pending_review"  # after-photo submitted, comparison ran
    verified = "verified"
    not_verified = "not_verified"


class PhotoType(str, enum.Enum):
    """
    Distinguishes a report's original ("before") photo from a follow-up
    ("after") photo submitted during verification. Used by the frontend
    to decide whether a map pin for a given photo should render red
    (unresolved / before) or green (verified / after) — see
    routers/reports.py's get_cluster_map_markers endpoint.
    """
    before = "before"
    after = "after"


@dataclass
class Cluster:
    """
    A cluster represents one real-world incident. Multiple reports can
    point to the same cluster if they're within CLUSTER_RADIUS_METERS and
    CLUSTER_TIME_WINDOW_HOURS of an existing report in that cluster.

    report_count is a real, stored field (not computed live) because
    Firestore has no relationship loading the way SQLAlchemy did — it's
    kept in sync explicitly by firestore_repo.add_report_to_cluster_and_recount.
    Denormalizing this way is a deliberate Firestore pattern (avoid a
    query-per-read to count subcollection docs), but it does mean: this
    field is only as accurate as the callers that keep it updated. Do
    not query report_count independently elsewhere and expect it to be
    up to date without going through the repo helpers.

    resolved_at is set the moment a cluster's status flips to `resolved`
    (see routers/reports.py's update_cluster_status — specifically, only
    on the actual pending/assigned -> resolved transition, not
    re-stamped on every subsequent PATCH that redundantly re-submits
    status=resolved on an already-resolved cluster; see that function's
    docstring for why). Frontend uses this to implement the "green
    marker fades after N seconds" behavior — see schemas/report.py's
    ClusterOutWithFade.seconds_since_resolved/should_still_display and
    core/config.py's RESOLVED_MARKER_DISPLAY_SECONDS for the constant
    that defines how long that window is.
    """
    id: str = field(default_factory=new_id)
    latitude: float = 0.0
    longitude: float = 0.0
    category: IssueCategory = IssueCategory.other

    severity_score: int = 0
    status: ReportStatus = ReportStatus.pending
    assigned_department: Optional[str] = None

    verification_status: VerificationStatus = VerificationStatus.not_submitted
    verification_confidence: Optional[float] = None
    municipal_summary: Optional[str] = None

    report_count: int = 0

    resolved_at: Optional[datetime] = None

    created_at: datetime = field(default_factory=now)
    updated_at: datetime = field(default_factory=now)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["category"] = self.category.value
        d["status"] = self.status.value
        d["verification_status"] = self.verification_status.value
        return d

    @classmethod
    def from_dict(cls, doc_id: str, data: dict[str, Any]) -> "Cluster":
        return cls(
            id=doc_id,
            latitude=data.get("latitude", 0.0),
            longitude=data.get("longitude", 0.0),
            category=IssueCategory(data.get("category", IssueCategory.other.value)),
            severity_score=data.get("severity_score", 0),
            status=ReportStatus(data.get("status", ReportStatus.pending.value)),
            assigned_department=data.get("assigned_department"),
            verification_status=VerificationStatus(
                data.get("verification_status", VerificationStatus.not_submitted.value)
            ),
            verification_confidence=data.get("verification_confidence"),
            municipal_summary=data.get("municipal_summary"),
            report_count=data.get("report_count", 0),
            resolved_at=data.get("resolved_at"),
            created_at=data.get("created_at") or now(),
            updated_at=data.get("updated_at") or now(),
        )


@dataclass
class Report:
    """
    A single citizen submission. photo_url points to the Cloudinary URL
    of the uploaded image (see app/services/cloudinary_storage.py).

    photo_url + photo_public_id (Cloudinary's own ID, needed to delete
    the asset later) replace the old local-disk photo_path.
    after_photo_url / after_photo_public_id are the equivalent for a
    follow-up verification photo.

    address is populated via reverse geocoding when the frontend sends
    coordinates from "use my current location" without the citizen
    typing an address themselves — see routers/geocoding.py.
    """
    id: str = field(default_factory=new_id)
    cluster_id: str = ""

    photo_url: str = ""
    photo_public_id: str = ""
    after_photo_url: Optional[str] = None
    after_photo_public_id: Optional[str] = None

    latitude: float = 0.0
    longitude: float = 0.0
    address: Optional[str] = None
    description: Optional[str] = None

    category: IssueCategory = IssueCategory.other
    ai_confidence: Optional[float] = None
    ai_raw_response: Optional[str] = None

    is_duplicate_of_cluster: bool = False

    created_at: datetime = field(default_factory=now)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["category"] = self.category.value
        return d

    @classmethod
    def from_dict(cls, doc_id: str, data: dict[str, Any]) -> "Report":
        return cls(
            id=doc_id,
            cluster_id=data.get("cluster_id", ""),
            photo_url=data.get("photo_url", ""),
            photo_public_id=data.get("photo_public_id", ""),
            after_photo_url=data.get("after_photo_url"),
            after_photo_public_id=data.get("after_photo_public_id"),
            latitude=data.get("latitude", 0.0),
            longitude=data.get("longitude", 0.0),
            address=data.get("address"),
            description=data.get("description"),
            category=IssueCategory(data.get("category", IssueCategory.other.value)),
            ai_confidence=data.get("ai_confidence"),
            ai_raw_response=data.get("ai_raw_response"),
            is_duplicate_of_cluster=data.get("is_duplicate_of_cluster", False),
            created_at=data.get("created_at") or now(),
        )