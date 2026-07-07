import math
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.core.config import settings
from app.models.report import IssueCategory

def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def find_matching_cluster(db, latitude: float, longitude: float, category) -> Optional[dict]:
    """
    Queries Firestore for nearby clusters of the same category, within
    the active time window.

    CHANGED: the time-window filter is now applied server-side in the
    Firestore query itself (.where("updated_at", ">=", cutoff_iso)),
    instead of being pulled into Python after streaming every document
    in the category. The old approach streamed the ENTIRE category
    collection on every single citizen upload, forever — at 10 clusters
    that's free, at 10,000 it's a full collection scan on every request.

    Firestore requires a composite index for a query that filters on
    two fields (category == X AND updated_at >= Y). The FIRST time you
    run this against a real Firestore instance, the client library will
    raise a FailedPrecondition error containing a direct link to create
    that index in the console — click it once, wait ~1-2 minutes for the
    index to build, and every query after that is fast. This is the
    "complex Firebase indexing error" the previous version's comment was
    dodging by moving the filter into Python; the actual fix is just to
    create the index once, not to avoid the indexed query permanently.

    updated_at is stored as an ISO 8601 string (see reports.py /
    ClusterModel), so the cutoff is also passed as an ISO string —
    Firestore compares them lexicographically, which is safe for ISO
    8601 timestamps in a fixed timezone (UTC, as used throughout this
    codebase) since lexicographic order matches chronological order.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.CLUSTER_TIME_WINDOW_HOURS)
    cutoff_iso = cutoff.isoformat()

    # FIX: Safely parse category string whether it arrives as an Enum class or a plain string
    category_str = category.value if hasattr(category, 'value') else str(category)

    clusters_ref = db.collection("clusters")
    query = (
        clusters_ref
        .where("category", "==", category_str)
        .where("updated_at", ">=", cutoff_iso)
    )

    for doc in query.stream():
        cluster_dict = doc.to_dict()
        cluster_dict["id"] = doc.id

        dist = _haversine_meters(latitude, longitude, cluster_dict["latitude"], cluster_dict["longitude"])
        if dist <= settings.CLUSTER_RADIUS_METERS:
            return cluster_dict

    return None


def recompute_cluster_centroid(cluster_dict: dict, new_report_dict: dict) -> dict:
    """Uses a weighted average to move the pin slightly towards new reports."""
    count = cluster_dict.get("report_count", 1)
    if count <= 1:
        return cluster_dict

    old_count = count - 1
    cluster_dict["latitude"] = ((cluster_dict["latitude"] * old_count) + new_report_dict["latitude"]) / count
    cluster_dict["longitude"] = ((cluster_dict["longitude"] * old_count) + new_report_dict["longitude"]) / count
    return cluster_dict