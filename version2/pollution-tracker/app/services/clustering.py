"""
Duplicate/cluster detection. Deliberately simple: geo-distance (haversine)
+ time window, no external geospatial library. This is cheap to build and
is one of the strongest "we understand government pain points" features
in the whole system, so it's worth getting right, but it does NOT need
PostGIS or anything heavyweight for hackathon scale.

If your city-scale data grows past a few thousand reports, look at
Firestore's native geohash-based geo queries (e.g. via a library like
geofirestore) instead — but don't build that under time pressure this
week.

EMERGENCY CATEGORIES (fire): deliberately bypass ALL of the above.
get_or_create_cluster() below is for the standard pollution workflow
(cluster-then-confirm) ONLY. Emergency reports go through
create_standalone_emergency_cluster() instead, which always creates a
brand-new cluster and never matches into an existing one — even if two
citizens report what is physically the same fire. This is an
intentional simplicity trade-off, not an oversight: every emergency
report should independently and immediately reach a human without any
deduplication logic sitting in between it and a dispatch. The cost is
that N citizens reporting one real fire produces N separate
maximum-severity queue entries rather than one — acceptable for this
build, but worth stating plainly if asked, since it's the opposite of
the dedup behavior this same file provides for pollution categories.

CONCURRENCY NOTE: find_matching_cluster() + creating a new cluster when
it returns None is a classic check-then-act race for the pollution
path. Two citizens reporting the same civic issue within milliseconds
of each other can both see "no matching cluster" and both create one,
silently defeating duplicate-detection under load. get_or_create_cluster()
wraps that sequence in a Firestore transaction so only one of two
concurrent callers wins the create. This concern does NOT apply to
create_standalone_emergency_cluster(), since standalone-by-design means
there's no "existing cluster" to race against in the first place.
"""
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from google.cloud import firestore

from app.core.config import settings
from app.models.report import Cluster, IssueCategory, ReportStatus
from app.services import firestore_repo


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lng points, in meters."""
    R = 6_371_000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def find_matching_cluster(
    db: firestore.Client,
    latitude: float,
    longitude: float,
    category: IssueCategory,
) -> Optional[Cluster]:
    """
    Looks for an existing cluster of the SAME category within both the
    configured radius and time window. Returns None if no match, meaning
    the caller should create a new cluster.

    NOT used for emergency categories (see module docstring) — this is
    exclusively part of the pollution cluster-then-confirm workflow.

    Note: this does a full scan of recent clusters in that category. Fine
    for hackathon scale (hundreds to low thousands of clusters). If this
    ever needs to scale further, add a bounding-box pre-filter before the
    haversine check, or move to geohash-based Firestore queries.

    NOTE: prefer get_or_create_cluster() below over calling this directly
    when the intent is "find or make one" — this function alone is racy
    under concurrent calls (see module docstring).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.CLUSTER_TIME_WINDOW_HOURS)

    candidate_clusters = firestore_repo.list_recent_clusters_by_category(db, category, cutoff)

    for cluster in candidate_clusters:
        distance = _haversine_meters(latitude, longitude, cluster.latitude, cluster.longitude)
        if distance <= settings.CLUSTER_RADIUS_METERS:
            return cluster

    return None


def get_or_create_cluster(
    db: firestore.Client,
    latitude: float,
    longitude: float,
    category: IssueCategory,
    assigned_department: str,
) -> tuple[Cluster, bool]:
    """
    Atomically finds a matching cluster or creates a new one, closing the
    check-then-act race window described in the module docstring.

    ONLY for non-emergency (pollution/civic) categories — see
    create_standalone_emergency_cluster() for the fire/emergency path,
    which deliberately skips matching entirely.

    Returns (cluster, was_newly_created).

    How the transaction closes the race: Firestore transactions use
    optimistic concurrency — the SDK tracks every document read inside
    the transaction function, and when the transaction tries to commit,
    Firestore checks whether any of those read documents changed since
    they were read. If a concurrent transaction wrote to one of them
    first, this transaction's commit is rejected and the SDK
    automatically retries the whole function body from the top (this is
    why the function below must be side-effect-free except through the
    `transaction` object — no direct db writes outside `transaction.set`).

    This does NOT prevent two *new* clusters within the same radius from
    both being read as "no match" in the first pass of two fully
    concurrent transactions — Firestore transactions don't lock a
    query's result set, only the specific documents each transaction
    reads or writes. What this DOES fully close is the far more common
    case: many citizens reporting the same ALREADY-EXISTING incident in
    a burst will correctly pile onto one cluster instead of fragmenting.
    """
    transaction = db.transaction()

    @firestore.transactional
    def _txn(transaction: firestore.Transaction) -> tuple[Cluster, bool]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.CLUSTER_TIME_WINDOW_HOURS)
        candidate_clusters = firestore_repo.list_recent_clusters_by_category_in_transaction(
            db, transaction, category, cutoff
        )

        for cluster in candidate_clusters:
            distance = _haversine_meters(latitude, longitude, cluster.latitude, cluster.longitude)
            if distance <= settings.CLUSTER_RADIUS_METERS:
                return cluster, False

        new_cluster = Cluster(
            latitude=latitude,
            longitude=longitude,
            category=category,
            status=ReportStatus.pending,
            assigned_department=assigned_department,
        )
        cluster_ref = db.collection(firestore_repo.CLUSTERS_COLLECTION).document(new_cluster.id)
        transaction.set(cluster_ref, new_cluster.to_dict())
        return new_cluster, True

    return _txn(transaction)


def create_standalone_emergency_cluster(
    db: firestore.Client,
    latitude: float,
    longitude: float,
    category: IssueCategory,
    assigned_department: str,
) -> Cluster:
    """
    Creates a brand-new cluster unconditionally — no matching against
    existing clusters, no transaction needed (there's nothing to race
    against when every call always creates fresh). Used exclusively for
    emergency categories (see IssueCategory.is_emergency and the module
    docstring above for why this is a deliberate simplicity choice, not
    an oversight).

    Caller is responsible for confirming category.is_emergency is True
    before calling this — this function does not check, since it should
    never be reachable for non-emergency categories through the normal
    router flow (see routers/reports.py's create_report branching).
    """
    new_cluster = Cluster(
        latitude=latitude,
        longitude=longitude,
        category=category,
        status=ReportStatus.pending,
        assigned_department=assigned_department,
    )
    firestore_repo.create_cluster(db, new_cluster)
    return new_cluster


def recompute_cluster_centroid(db: firestore.Client, cluster: Cluster) -> None:
    """
    Recalculates the cluster's lat/lng as the average of all its reports'
    coordinates. Call this after adding a new report to a cluster.

    For emergency/standalone clusters this is a no-op in effect (single
    report = centroid equals that report's own coordinates), but it's
    still safe and correct to call unconditionally, so routers/reports.py
    doesn't need a special case here.
    """
    reports = firestore_repo.list_reports_for_cluster(db, cluster.id)
    if not reports:
        return
    cluster.latitude = sum(r.latitude for r in reports) / len(reports)
    cluster.longitude = sum(r.longitude for r in reports) / len(reports)