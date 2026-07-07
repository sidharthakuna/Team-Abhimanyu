"""
Before/after verification endpoint — Day 3 differentiator feature.
"""
import logging
import base64
from fastapi import APIRouter, UploadFile, File, HTTPException
from google.cloud import firestore

from app.core.database import db
from app.models.report import VerificationStatus
from app.schemas.report import ClusterOut
from app.services import storage
from app.services.verification import verify_before_after
from app.core.config import settings
from app.routers.auth import _send_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/verification", tags=["verification"])

@router.post("/clusters/{cluster_id}/verify", response_model=ClusterOut)
async def submit_after_photo(cluster_id: str, after_photo: UploadFile = File(...)):
    """Submits an 'after' photo, converts to Base64, and delegates to the verification service."""
    # 1. Fetch Cluster from Firestore
    cluster_ref = db.collection("clusters").document(cluster_id)
    cluster_doc = cluster_ref.get()
    
    if not cluster_doc.exists:
        raise HTTPException(status_code=404, detail="Cluster not found")
        
    cluster_dict = cluster_doc.to_dict()
    cluster_dict["id"] = cluster_doc.id

    # 2. Find the original report to compare against.
    #
    # CHANGED: this used to run the SAME query twice — once to sort and
    # find the oldest report's data, then AGAIN just to recover that
    # report's document ID (which the first query already had, but threw
    # away by converting straight to .to_dict()). It also matched the two
    # queries up by comparing created_at values for equality, which is
    # fragile: if two reports in the same cluster land in the same
    # second, that match could pick the wrong document.
    #
    # Now this queries once, sorts the (doc, dict) pairs together so the
    # doc reference for the oldest report travels alongside its data,
    # and never needs a second round-trip or a timestamp-equality match.
    reports_query = db.collection("reports").where("cluster_id", "==", cluster_id)
    all_report_docs = list(reports_query.stream())

    if not all_report_docs:
        raise HTTPException(status_code=422, detail="Cluster has no reports to compare against")

    # Sort by created_at ascending; oldest first. The doc (with its .id)
    # and its .to_dict() are sorted together as a pair, so we never lose
    # track of which document the oldest data came from.
    all_report_docs.sort(key=lambda doc: doc.to_dict().get("created_at", ""))
    original_report_doc = all_report_docs[0]
    original_report_dict = original_report_doc.to_dict()
    original_report_doc_id = original_report_doc.id

    if not after_photo:
        raise HTTPException(status_code=422, detail="Empty photo upload")
        
    # 3. Read the new 'after' photo 
    after_photo_url = await storage.upload_evidence_to_cloud(after_photo)
    
    await after_photo.seek(0)
    after_bytes = await after_photo.read()

    # 4. Decode the original Base64 photo back into raw bytes for Gemini
    try:
        base64_data = original_report_dict["photo_url"].split(",")[1]
        before_bytes = base64.b64decode(base64_data)
    except Exception as e:
        logger.error(f"Failed to decode Base64 image from DB: {e}")
        raise HTTPException(status_code=500, detail="Could not process original image data for comparison.")

    # 5. Delegate to the separate Service layer
    result = verify_before_after(before_bytes, after_bytes)

    # 6. Update Firestore with the results
    new_status = result.verification_status.value if hasattr(result.verification_status, 'value') else result.verification_status
    
    cluster_dict["verification_status"] = new_status
    cluster_dict["verification_confidence"] = result.confidence
    cluster_dict["status"] = "resolved"

    cluster_ref.update({
        "verification_status": new_status,
        "verification_confidence": result.confidence,
        "status": "resolved"
    })
    
    # original_report_doc_id now comes directly from the single query
    # above rather than a second lookup, so this is always populated
    # when there was at least one report (guaranteed by the check above)
    # — no longer conditional on a timestamp match succeeding.
    db.collection("reports").document(original_report_doc_id).update({
        "after_photo_url": after_photo_url
    })

    if new_status == VerificationStatus.verified.value:
        logger.info("Cluster %s verified as resolved (confidence=%.2f)", cluster_id, result.confidence)

    # =========================================================================
    # 📧 --- BROADCAST CITIZEN COMPLETION ALERTS (EMAIL) --- 📧
    # =========================================================================
    # NOTE: deliberately not linking after_photo_url in the email body.
    # storage.py stores photos as `data:image/jpeg;base64,...` data URLs
    # (see upload_evidence_to_cloud) — these are typically hundreds of KB
    # of inline text, not a fetchable link, so pasting one into an email
    # would produce a broken/huge, unclickable "link" rather than
    # something a citizen could actually open. If you want a real "view
    # proof" link, that needs the photo hosted somewhere fetchable by URL
    # (e.g. actual Firebase Cloud Storage) rather than embedded as base64.
    citizens_to_notify = cluster_dict.get("notified_citizens", [])

    if citizens_to_notify and not settings.SMTP_MOCK_MODE:
        for citizen_email in citizens_to_notify:
            try:
                _send_email(
                    to_email=citizen_email,
                    subject="Saaf Sarkar: Your reported issue has been resolved",
                    body=(
                        "Thank you for stepping in! The issue you reported has "
                        "been resolved and verified by city engineers.\n\n"
                        "You're receiving this because you're on the notification "
                        "list for this report."
                    ),
                )
                logger.info("Closure alert email sent cleanly to %s", citizen_email)
            except Exception as email_err:
                logger.error("Email broadcast skip for %s: %s", citizen_email, str(email_err))
    elif citizens_to_notify:
        logger.warning(
            "SMTP_MOCK_MODE active — skipping %d closure alert email(s) that would have been sent.",
            len(citizens_to_notify),
        )
    # =========================================================================

    return cluster_dict