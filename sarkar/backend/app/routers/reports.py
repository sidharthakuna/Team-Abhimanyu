"""
Core report endpoints: citizen upload, listing for the dashboard, status updates, and admin deletion utilities.
"""
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from google.cloud import firestore

from app.core.database import db 
from app.models.report import ClusterModel, ReportModel, ReportStatus
from app.routers.auth import require_verified_identity
from app.schemas.report import ClusterOut, ClusterStatusUpdate, ReportOut
from app.services import storage 
from app.services.classifier import classify_image
from app.services.clustering import find_matching_cluster, recompute_cluster_centroid
from app.services.severity import compute_severity, route_department

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


@firestore.transactional
def _write_report_in_transaction(
    transaction: firestore.Transaction,
    db,
    cluster_id: str,
    cluster_is_new: bool,
    new_cluster_dict: Optional[dict],
    latitude: float,
    longitude: float,
    description: Optional[str],
    photo_url: str,
    classification,
    identity: str,
) -> dict:
    """
    Does the entire find-or-join-cluster + increment + write as one
    Firestore transaction.

    WHY THIS EXISTS: the previous version read the cluster, did some
    work (image classify, upload, compress — all already done by the
    time we get here), then wrote report_count + 1 and an updated
    notified_citizens list back. If two citizens reported the same spot
    within milliseconds of each other, both requests would read
    report_count=N, both compute N+1, and the second write would
    silently clobber the first — one citizen's report effectively
    vanishes from the count, and their email drops out of
    notified_citizens, so they never get the resolution notification
    later. This isn't an edge case: clustering exists specifically to
    group near-simultaneous reports of the same incident, so bursts of
    concurrent writes to the same cluster document are the NORMAL case,
    not a rare one.

    @firestore.transactional makes Firestore re-run this whole function
    from scratch if it detects the cluster document changed between our
    read and our write (optimistic concurrency) — so the "loser" of a
    race just gets retried automatically with the fresh data, instead of
    silently overwriting it. All reads of the cluster/report_count MUST
    happen via `transaction.get(...)` (not `doc.get()` directly) for this
    guarantee to hold, and all writes MUST go through `transaction.set()`
    — mixing in a plain db.batch() partially inside a transactional
    function is what would silently break the guarantee.

    Returns the final report dict (what the endpoint returns to the
    citizen).
    """
    cluster_ref = db.collection("clusters").document(cluster_id)

    if cluster_is_new:
        # Nothing to re-read for a brand-new cluster — there's no
        # existing document to race against yet. We still go through
        # the transaction for the write so it lands atomically with the
        # report document below.
        cluster_dict = dict(new_cluster_dict)
    else:
        # Re-read INSIDE the transaction, not reusing the dict from
        # find_matching_cluster() above. That earlier read may now be
        # stale if another request modified this same cluster in the
        # gap between find_matching_cluster() returning and this
        # transaction starting (which includes the classify/upload/
        # compress work that already happened before we got here).
        snapshot = cluster_ref.get(transaction=transaction)
        if not snapshot.exists:
            # Extremely unlikely (would mean the cluster was deleted in
            # that same gap) but handled explicitly rather than letting
            # a bare KeyError bubble up as a confusing 500.
            raise HTTPException(
                status_code=409,
                detail="The matched cluster was deleted while this report was being processed. Please retry.",
            )
        cluster_dict = snapshot.to_dict()
        cluster_dict["id"] = cluster_id

    current_citizens = cluster_dict.get("notified_citizens", [])
    if identity not in current_citizens:
        current_citizens = current_citizens + [identity]
    cluster_dict["notified_citizens"] = current_citizens

    report = ReportModel(
        cluster_id=cluster_id,
        photo_url=photo_url,
        latitude=latitude,
        longitude=longitude,
        description=description,
        category=classification.category,
        ai_confidence=classification.confidence,
        ai_raw_response=classification.raw_response,
        is_duplicate_of_cluster=(cluster_dict.get("report_count", 0) > 0),
    )

    cluster_dict["report_count"] = cluster_dict.get("report_count", 0) + 1
    cluster_dict = recompute_cluster_centroid(cluster_dict, report.to_firestore())
    cluster_dict["severity_score"] = compute_severity(cluster_dict)
    cluster_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

    transaction.set(cluster_ref, cluster_dict)
    transaction.set(db.collection("reports").document(report.id), report.to_firestore())

    return report.to_firestore()


@router.post("", response_model=ReportOut, status_code=201)
async def create_report(
    latitude: float = Form(...),
    longitude: float = Form(...),
    description: Optional[str] = Form(None),
    photo: UploadFile = File(...),
    identity: str = Depends(require_verified_identity),
):
    """
    Citizen upload endpoint with email/Google authentication capture.

    identity (a verified email address) is no longer a client-supplied
    form field — it comes from require_verified_identity, which
    validates the bearer token minted by POST /api/auth/verify-otp or
    POST /api/auth/google-login. A request with no token, an expired
    token, or a tampered token gets a 401 before any of this function
    body runs. This closes the previous gap where any caller could type
    an arbitrary identity into the form and have it trusted and stored
    in notified_citizens without ever proving they owned it.
    """
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="Invalid latitude/longitude")
    if not photo.content_type or not photo.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="File must be an image")

    photo_bytes = await photo.read()
    photo_url = await storage.upload_evidence_to_cloud(photo)
    classification = classify_image(photo_bytes)

    # This lookup happens OUTSIDE the transaction — it's read-only and
    # just decides which cluster_id we're targeting. The actual
    # read-modify-write against that cluster_id happens inside the
    # transaction below, which re-reads fresh data rather than trusting
    # this snapshot if the cluster already existed.
    cluster_dict = find_matching_cluster(db, latitude, longitude, classification.category)

    if cluster_dict is None:
        new_cluster = ClusterModel(
            latitude=latitude,
            longitude=longitude,
            category=classification.category,
            status=ReportStatus.pending,
            assigned_department=route_department(classification.category),
            report_count=0,
        )
        cluster_id = new_cluster.id
        new_cluster_dict = new_cluster.to_firestore()
        new_cluster_dict["id"] = cluster_id
        new_cluster_dict["notified_citizens"] = []  # transaction fn adds `identity` below
        cluster_is_new = True
    else:
        cluster_id = cluster_dict["id"]
        new_cluster_dict = None
        cluster_is_new = False

    transaction = db.transaction()
    report_dict = _write_report_in_transaction(
        transaction,
        db,
        cluster_id=cluster_id,
        cluster_is_new=cluster_is_new,
        new_cluster_dict=new_cluster_dict,
        latitude=latitude,
        longitude=longitude,
        description=description,
        photo_url=photo_url,
        classification=classification,
        identity=identity,
    )

    return report_dict


@router.get("/clusters", response_model=List[ClusterOut])
def list_clusters(status: Optional[ReportStatus] = None):
    """Returns a chronologically structured First-Come, First-Served triage matrix queue."""
    clusters_ref = db.collection("clusters")

    # Sort purely by created_at in ASCENDING order (Oldest first = FIFO queue)
    if status:
        query = clusters_ref.where("status", "==", status.value).order_by("created_at", direction=firestore.Query.ASCENDING)
    else:
        query = clusters_ref.order_by("created_at", direction=firestore.Query.ASCENDING)

    docs = query.stream()
    return [doc.to_dict() for doc in docs]


@router.get("/clusters/{cluster_id}", response_model=ClusterOut)
def get_cluster(cluster_id: str):
    doc = db.collection("clusters").document(cluster_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return doc.to_dict()


@router.get("/clusters/{cluster_id}/reports", response_model=List[ReportOut])
def get_cluster_reports(cluster_id: str):
    reports_ref = db.collection("reports")
    query = reports_ref.where("cluster_id", "==", cluster_id)
    docs = query.stream()
    return [doc.to_dict() for doc in docs]


@router.patch("/clusters/{cluster_id}/status", response_model=ClusterOut)
def update_cluster_status(cluster_id: str, update: ClusterStatusUpdate):
    cluster_ref = db.collection("clusters").document(cluster_id)
    doc = cluster_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Cluster not found")
    cluster_ref.update({
        "status": update.status.value,
        "updated_at": datetime.now(timezone.utc).isoformat()
    })
    return cluster_ref.get().to_dict()


@router.delete("/clusters/{cluster_id}", status_code=204)
def delete_cluster(cluster_id: str):
    """
    Administrative deletion engine. Removes an incident cluster AND its
    associated reports from Firestore.

    CHANGED: previously this only deleted the cluster document and left
    every report with that cluster_id orphaned in the `reports`
    collection permanently. Now it batch-deletes the cluster and all
    reports referencing it together, so nothing is left pointing at a
    cluster_id that no longer resolves to anything.
    """
    cluster_ref = db.collection("clusters").document(cluster_id)
    if not cluster_ref.get().exists:
        raise HTTPException(status_code=404, detail="Cluster not found")

    batch = db.batch()
    batch.delete(cluster_ref)

    reports_query = db.collection("reports").where("cluster_id", "==", cluster_id)
    for report_doc in reports_query.stream():
        batch.delete(report_doc.reference)

    batch.commit()
    return {"status": "success"}