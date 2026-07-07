"""
Core data models for Firestore (NoSQL).

Two main collections:
- clusters: a group of reports that are likely the same real-world incident
  (same location + time window). This is what powers duplicate detection.
- reports: a single citizen submission. Belongs to exactly one cluster.
"""
import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class IssueCategory(str, enum.Enum):
    garbage = "garbage"
    water_pollution = "water_pollution"
    air_pollution = "air_pollution"
    industrial_waste = "industrial_waste"
    sewage = "sewage"
    other = "other"


class ReportStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    resolved = "resolved"


class VerificationStatus(str, enum.Enum):
    not_submitted = "not_submitted"   # no after-photo yet
    pending_review = "pending_review"  # after-photo submitted, Gemini comparison ran
    verified = "verified"
    not_verified = "not_verified"


class ClusterModel(BaseModel):
    """
    A cluster represents one real-world incident in the 'clusters' Firestore collection.
    """
    id: str = Field(default_factory=_uuid)
    
    # Centroid location, recalculated as new reports join the cluster.
    latitude: float
    longitude: float
    category: IssueCategory

    severity_score: int = 0
    status: ReportStatus = ReportStatus.pending
    assigned_department: Optional[str] = None

    verification_status: VerificationStatus = VerificationStatus.not_submitted
    verification_confidence: Optional[float] = None  # 0.0 - 1.0
    municipal_summary: Optional[str] = None  # Gemini-generated report paragraph

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    
    # Replaces SQLAlchemy's relationship count for NoSQL optimization
    report_count: int = 0 

    def to_firestore(self) -> dict:
        """Converts the Pydantic model to a Firestore-compatible dictionary."""
        return self.model_dump(mode='json')


class ReportModel(BaseModel):
    """
    A single citizen submission in the 'reports' Firestore collection.
    """
    id: str = Field(default_factory=_uuid)
    cluster_id: str

    # Updated to URL assuming you will store images in Firebase Cloud Storage or similar
    photo_url: str
    after_photo_url: Optional[str] = None  # before/after verification

    latitude: float
    longitude: float
    description: Optional[str] = None

    category: IssueCategory
    ai_confidence: Optional[float] = None  # Gemini's confidence in the classification
    ai_raw_response: Optional[str] = None  # stored for debugging during the hackathon

    is_duplicate_of_cluster: bool = False

    created_at: datetime = Field(default_factory=_now)

    def to_firestore(self) -> dict:
        """Converts the Pydantic model to a Firestore-compatible dictionary."""
        return self.model_dump(mode='json')