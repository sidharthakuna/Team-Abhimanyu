"""
Core report endpoints: citizen upload, listing for the dashboard, and
status updates. This is the Day 1-2 loop from the roadmap:
upload -> classify -> score -> cluster -> show on dashboard -> update status.

Frontend team: build against these routes and the schemas in
app/schemas/report.py. That file IS the contract — if you need a field
that's not there, ask before assuming it exists.

RESPONSE MODEL NOTE: list_clusters, get_cluster, and
update_cluster_status all use ClusterOutWithFade (not the plain
ClusterOut) — these are the "map-facing" endpoints a poller or an
admin action calls to decide whether a resolved marker should still
render (see schemas/report.py's ClusterOutWithFade docstring for why
should_still_display/seconds_since_resolved exist and why they weren't
made the default on ClusterOut everywhere). get_cluster_map_markers is
unaffected — it returns MapMarkerOut, an unrelated schema with no
resolved/fade concept.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from google.cloud import firestore

from app.core.database import get_db
from app.models.report import PhotoType, Report, ReportStatus, now
from app.schemas.report import ClusterOutWithFade, ClusterStatusUpdate, MapMarkerOut, ReportOut
from app.services import cloudinary_storage, firestore_repo
from app.services.classifier import classify_image
from app.services.clustering import (
    create_standalone_emergency_cluster,
    get_or_create_cluster,
    recompute_cluster_centroid,
)
from app.services.severity import compute_severity, route_department

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("", response_model=ReportOut, status_code=201)
async def create_report(
    latitude: float = Form(...),
    longitude: float = Form(...),
    description: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    photo: UploadFile = File(...),
    db: firestore.Client = Depends(get_db),
):
    """
    Citizen upload endpoint. Multipart form: latitude, longitude,
    description (optional), address (optional — see ReportCreate's
    docstring on where this comes from), photo (file).

    Pipeline: upload photo to Cloudinary -> classify with Gemini (or
    mock) -> branch on category.is_emergency:
      - emergency (fire): create_standalone_emergency_cluster()
        unconditionally, no matching against existing clusters (see
        clustering.py's module docstring for why this is deliberate).
      - non-emergency: find-or-create matching cluster ATOMICALLY (see
        clustering.get_or_create_cluster's docstring for why this needs
        to be a transaction, not a separate find-then-create).
    Then recompute severity and return the report.
    """
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="Invalid latitude/longitude")

    # Guards against non-image uploads (e.g. a .txt or .pdf) sailing
    # straight through to classify_image()/Gemini. Browsers/clients set
    # content_type from the file's extension or sniffed type, so this
    # isn't bulletproof against a deliberately relabeled file, but it
    # catches the honest-mistake case cheaply before we spend a
    # classification call on it.
    if not photo.content_type or not photo.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="File must be an image")

    photo_bytes = await photo.read()
    if not photo_bytes:
        raise HTTPException(status_code=422, detail="Empty photo upload")

    photo_url, photo_public_id = cloudinary_storage.save_photo(photo_bytes, photo.filename or "upload.jpg")

    classification = classify_image(photo_bytes)
    assigned_department = route_department(classification.category)

    if classification.category.is_emergency:
        # Emergency path: always a brand-new, standalone cluster — never
        # matched against an existing one. See clustering.py's module
        # docstring for why N citizens reporting the same real fire
        # deliberately produces N separate maximum-severity entries
        # instead of being deduplicated.
        cluster = create_standalone_emergency_cluster(
            db, latitude, longitude, classification.category,
            assigned_department=assigned_department,
        )
        is_new_cluster = True
    else:
        cluster, is_new_cluster = get_or_create_cluster(
            db, latitude, longitude, classification.category,
            assigned_department=assigned_department,
        )

    report = Report(
        cluster_id=cluster.id,
        photo_url=photo_url,
        photo_public_id=photo_public_id,
        latitude=latitude,
        longitude=longitude,
        address=address,
        description=description,
        category=classification.category,
        ai_confidence=classification.confidence,
        ai_raw_response=classification.raw_response,
        is_duplicate_of_cluster=not is_new_cluster,
    )

    # Writes the report, then re-fetches the cluster's full report list
    # to get an accurate count.
    cluster = firestore_repo.add_report_to_cluster_and_recount(db, report, cluster)

    recompute_cluster_centroid(db, cluster)
    cluster.severity_score = compute_severity(cluster)
    firestore_repo.update_cluster(db, cluster)

    logger.info(
        "Report %s created in cluster %s (category=%s, severity=%d, reports_in_cluster=%d)",
        report.id, cluster.id, cluster.category.value, cluster.severity_score, cluster.report_count,
    )

    return report


@router.get("/clusters", response_model=List[ClusterOutWithFade])
def list_clusters(
    status: Optional[ReportStatus] = None,
    db: firestore.Client = Depends(get_db),
):
    """
    Dashboard endpoint: returns clusters (not raw reports), ranked by
    severity descending. This is what the admin map + table should call.

    ClusterOutWithFade (not plain ClusterOut) since this is exactly the
    endpoint a poller calls repeatedly to decide whether a resolved
    cluster's marker should still render — see
    schemas/report.py's ClusterOutWithFade docstring.
    """
    return firestore_repo.list_clusters(db, status)


@router.get("/clusters/{cluster_id}", response_model=ClusterOutWithFade)
def get_cluster(cluster_id: str, db: firestore.Client = Depends(get_db)):
    cluster = firestore_repo.get_cluster(db, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return cluster


@router.get("/clusters/{cluster_id}/reports", response_model=List[ReportOut])
def get_cluster_reports(cluster_id: str, db: firestore.Client = Depends(get_db)):
    """Returns all individual reports that make up a cluster."""
    cluster = firestore_repo.get_cluster(db, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return firestore_repo.list_reports_for_cluster(db, cluster_id)


@router.get("/clusters/{cluster_id}/map-markers", response_model=List[MapMarkerOut])
def get_cluster_map_markers(cluster_id: str, db: firestore.Client = Depends(get_db)):
    """
    Endpoint for the before/after red-and-green-dots map feature.

    Returns one marker per BEFORE photo (one per report in the cluster —
    a cluster can have several citizen reports, each with its own
    original photo) plus one marker per AFTER photo actually submitted
    (only reports that have gone through verification will have one).
    Reports with no after-photo yet contribute only a 'before' marker.

    Frontend is expected to render photo_type == 'before' as a red dot
    and photo_type == 'after' as a green dot, but the actual color
    choice is a frontend/design decision — this endpoint just labels
    which is which and leaves rendering to the client.

    Uses MapMarkerOut, not ClusterOutWithFade — this schema has no
    resolved/fade concept of its own; a resolved cluster's markers are
    still returned here regardless of the fade window, since this
    endpoint is about photo pins, not the fade-out state list_clusters/
    get_cluster expose.
    """
    cluster = firestore_repo.get_cluster(db, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")

    reports = firestore_repo.list_reports_for_cluster(db, cluster_id)
    markers: List[MapMarkerOut] = []

    for report in reports:
        markers.append(MapMarkerOut(
            cluster_id=cluster.id,
            report_id=report.id,
            photo_type=PhotoType.before,
            photo_url=report.photo_url,
            latitude=report.latitude,
            longitude=report.longitude,
            category=report.category,
            status=cluster.status,
            verification_status=cluster.verification_status,
            address=report.address,
        ))
        if report.after_photo_url:
            markers.append(MapMarkerOut(
                cluster_id=cluster.id,
                report_id=report.id,
                photo_type=PhotoType.after,
                photo_url=report.after_photo_url,
                latitude=report.latitude,
                longitude=report.longitude,
                category=report.category,
                status=cluster.status,
                verification_status=cluster.verification_status,
                address=report.address,
            ))

    return markers


@router.patch("/clusters/{cluster_id}/status", response_model=ClusterOutWithFade)
def update_cluster_status(
    cluster_id: str,
    update: ClusterStatusUpdate,
    db: firestore.Client = Depends(get_db),
):
    """
    Admin dashboard status update: Pending -> Assigned -> Resolved.

    ClusterOutWithFade so that the moment an admin flips a cluster to
    resolved, the response the frontend gets back already carries
    should_still_display/seconds_since_resolved — this is the exact
    request/response pair where resolved_at actually gets set, so the
    frontend can start its fade countdown from this response instead of
    waiting for the next poll cycle to notice the status changed.

    resolved_at is stamped ONLY on the actual pending/assigned ->
    resolved transition (checked against the cluster's status BEFORE
    this update is applied), not unconditionally whenever
    status=resolved is submitted. This matters: if an admin's client
    retries a PATCH after a network blip, or double-submits the same
    status, re-stamping resolved_at on an already-resolved cluster
    would reset the fade countdown and make an old resolution look
    freshly resolved — the opposite of what the fade window is meant to
    represent. A transition OUT of resolved (e.g. reopened back to
    assigned) intentionally leaves the old resolved_at in place rather
    than clearing it; nothing currently reads resolved_at while
    status != resolved (see ClusterOutWithFade.should_still_display,
    which short-circuits to True whenever status isn't resolved), so a
    stale timestamp sitting there is inert until the next real
    resolution overwrites it.
    """
    cluster = firestore_repo.get_cluster(db, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")

    is_new_resolution = (
        update.status == ReportStatus.resolved and cluster.status != ReportStatus.resolved
    )

    cluster.status = update.status
    if is_new_resolution:
        cluster.resolved_at = now()

    firestore_repo.update_cluster(db, cluster)
    return cluster