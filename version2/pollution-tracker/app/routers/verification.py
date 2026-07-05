"""
Before/after verification endpoint — the Day 3 differentiator feature.
Citizen or municipal worker submits a follow-up photo; Gemini (or mock)
compares it against the original and returns a verified/not-verified
confidence.

The original report is updated (after_photo_url/after_photo_public_id)
via firestore_repo.update_report; read_photo does an HTTP fetch (via
cloudinary_storage) so its error path is httpx.HTTPStatusError, handled
below.
"""
import logging

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from google.cloud import firestore
import httpx

from app.core.database import get_db
from app.models.report import VerificationStatus
from app.schemas.report import ClusterOut
from app.services import cloudinary_storage, firestore_repo
from app.services.verification import verify_before_after

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/verification", tags=["verification"])


@router.post("/clusters/{cluster_id}/verify", response_model=ClusterOut)
async def submit_after_photo(
    cluster_id: str,
    after_photo: UploadFile = File(...),
    db: firestore.Client = Depends(get_db),
):
    """
    Submits an "after" photo for a cluster. Compares it against the
    ORIGINAL report's photo (the first report in the cluster) and updates
    the cluster's verification status + confidence.
    """
    cluster = firestore_repo.get_cluster(db, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")

    reports = firestore_repo.list_reports_for_cluster(db, cluster_id)
    if not reports:
        raise HTTPException(status_code=422, detail="Cluster has no reports to compare against")

    original_report = min(reports, key=lambda r: r.created_at)

    after_bytes = await after_photo.read()
    if not after_bytes:
        raise HTTPException(status_code=422, detail="Empty photo upload")

    after_photo_url, after_photo_public_id = cloudinary_storage.save_photo(
        after_bytes, after_photo.filename or "after.jpg"
    )
    original_report.after_photo_url = after_photo_url
    original_report.after_photo_public_id = after_photo_public_id

    try:
        before_bytes = cloudinary_storage.read_photo(original_report.photo_url)
    except httpx.HTTPStatusError as e:
        logger.error("Could not fetch original photo for comparison: %s", e)
        raise HTTPException(
            status_code=409,
            detail="Original photo could not be retrieved for comparison — it may have been deleted.",
        ) from e

    result = verify_before_after(before_bytes, after_bytes)

    firestore_repo.update_report(db, original_report)

    cluster.verification_status = result.verification_status
    cluster.verification_confidence = result.confidence
    firestore_repo.update_cluster(db, cluster)

    if result.verification_status == VerificationStatus.verified:
        logger.info("Cluster %s verified as resolved (confidence=%.2f)", cluster_id, result.confidence)

    return cluster
