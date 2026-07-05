"""
Firestore read/write helpers. This file exists because Firestore has no
ORM, no JOINs, and no relationship loading the way SQLAlchemy did. Every
place old SQLAlchemy-style code would have said `cluster.reports` (a
lazy-loaded relationship) instead needs an explicit query, which lives
here so routers/services never touch `db.collection(...)` directly.

Two lookup functions for "clusters recently touched in category X" exist
because they're used in genuinely different contexts:

- list_recent_clusters_by_category(): a plain read, used by
  air_quality_risk.py where there's no concurrent-write race to worry
  about — it's read-only aggregation, not a find-or-create decision.
- list_recent_clusters_by_category_in_transaction(): the same filter,
  but issued via transaction.get(query) instead of query.stream(),
  because Firestore requires every read inside a @firestore.transactional
  function to go through the transaction object — a plain query.stream()
  call from inside a transaction function would not be tracked for
  optimistic-concurrency purposes, silently defeating the whole point of
  wrapping get_or_create_cluster() in a transaction in the first place.
  This is the one clustering.py's get_or_create_cluster() calls.
"""
import logging
from datetime import datetime

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from app.core.config import settings
from app.models.report import Cluster, IssueCategory, Report

logger = logging.getLogger(__name__)

REPORTS_COLLECTION = "reports"
CLUSTERS_COLLECTION = "clusters"
_TIMEOUT = settings.FIRESTORE_CALL_TIMEOUT_SECONDS


def get_report(db: firestore.Client, report_id: str) -> Report | None:
    doc = db.collection(REPORTS_COLLECTION).document(report_id).get(timeout=_TIMEOUT)
    if not doc.exists:
        return None
    return Report.from_dict(doc.id, doc.to_dict())


def create_report(db: firestore.Client, report: Report) -> Report:
    db.collection(REPORTS_COLLECTION).document(report.id).set(report.to_dict(), timeout=_TIMEOUT)
    return report


def update_report(db: firestore.Client, report: Report) -> Report:
    db.collection(REPORTS_COLLECTION).document(report.id).set(report.to_dict(), timeout=_TIMEOUT)
    return report


def list_reports_for_cluster(db: firestore.Client, cluster_id: str) -> list[Report]:
    """
    Replaces the old `cluster.reports` relationship access. Every call
    site that would read `cluster.reports` (recompute_cluster_centroid,
    compute_severity via report_count, the /clusters/{id}/reports
    endpoint, verification's "find the original report") calls this
    explicitly instead.

    Ordered by created_at ascending (then document ID as a tiebreaker
    for reports sharing an identical timestamp) so every caller gets a
    stable, reproducible order — most importantly verification.py's
    min(reports, key=lambda r: r.created_at), which relies on the
    earliest report being genuinely first rather than an artifact of
    Firestore's otherwise-unspecified return order for an unordered
    query. Callers that don't care about order (centroid averaging, map
    markers) are unaffected either way.

    NOTE: this query shape needs a composite index on
    (cluster_id ASC, created_at ASC, __name__ ASC). Firestore will
    return an error containing a direct console link to create it the
    first time this runs against real data if it's missing.
    """
    query = (
        db.collection(REPORTS_COLLECTION)
        .where(filter=FieldFilter("cluster_id", "==", cluster_id))
        .order_by("created_at")
        .order_by("__name__")
    )
    return [Report.from_dict(doc.id, doc.to_dict()) for doc in query.stream(timeout=_TIMEOUT)]


def get_cluster(db: firestore.Client, cluster_id: str) -> Cluster | None:
    doc = db.collection(CLUSTERS_COLLECTION).document(cluster_id).get(timeout=_TIMEOUT)
    if not doc.exists:
        return None
    return Cluster.from_dict(doc.id, doc.to_dict())


def create_cluster(db: firestore.Client, cluster: Cluster) -> Cluster:
    db.collection(CLUSTERS_COLLECTION).document(cluster.id).set(cluster.to_dict(), timeout=_TIMEOUT)
    return cluster


def update_cluster(db: firestore.Client, cluster: Cluster) -> Cluster:
    db.collection(CLUSTERS_COLLECTION).document(cluster.id).set(cluster.to_dict(), timeout=_TIMEOUT)
    return cluster


def list_clusters(db: firestore.Client, status: str | None = None) -> list[Cluster]:
    query = db.collection(CLUSTERS_COLLECTION)
    if status is not None:
        query = query.where(filter=FieldFilter("status", "==", status))
    query = query.order_by("severity_score", direction=firestore.Query.DESCENDING)
    return [Cluster.from_dict(doc.id, doc.to_dict()) for doc in query.stream(timeout=_TIMEOUT)]


def find_matching_cluster_readonly(
    db: firestore.Client,
    category: IssueCategory,
    latitude: float,
    longitude: float,
    since: datetime,
    radius_meters: float,
) -> Cluster | None:
    """
    Plain (non-transactional) candidate search — used outside the
    find-or-create decision path, e.g. read-only lookups that just want
    "is there a nearby cluster" without needing transactional isolation.

    Named find_matching_cluster_readonly (not find_matching_cluster) to
    avoid colliding with services/clustering.py's find_matching_cluster,
    which takes a different argument order/count
    (db, latitude, longitude, category — no since/radius_meters, since
    it reads those from settings internally) and serves the
    pollution-workflow-specific lookup that get_or_create_cluster's
    logic is based on. Same underlying idea (haversine-filtered
    category search), different call site expectations — keeping them
    as one name in two files was a latent TypeError waiting for whoever
    imported the "wrong" one first. Both were unused in the codebase as
    of this rename; if you're wiring one of them in going forward,
    clustering.py's version is the one already aligned with
    CLUSTER_RADIUS_METERS/CLUSTER_TIME_WINDOW_HOURS from config.py,
    while this one is the more general-purpose version for callers that
    want to pass their own since/radius_meters explicitly (e.g. a
    future endpoint checking "is there anything nearby in the last hour
    specifically", independent of the standard cluster window).
    """
    candidates = list_recent_clusters_by_category(db, category, since)
    from app.services.clustering import _haversine_meters as haversine

    for cluster in candidates:
        if haversine(latitude, longitude, cluster.latitude, cluster.longitude) <= radius_meters:
            return cluster
    return None


def list_recent_clusters_by_category(
    db: firestore.Client, category: IssueCategory, since: datetime
) -> list[Cluster]:
    """
    Read-only variant — used by air_quality_risk.py, where there's no
    concurrent find-or-create race to guard against, just aggregation
    over existing data.
    """
    query = (
        db.collection(CLUSTERS_COLLECTION)
        .where(filter=FieldFilter("category", "==", category.value))
        .where(filter=FieldFilter("updated_at", ">=", since))
    )
    return [Cluster.from_dict(doc.id, doc.to_dict()) for doc in query.stream(timeout=_TIMEOUT)]


def list_recent_clusters_by_category_in_transaction(
    db: firestore.Client,
    transaction: firestore.Transaction,
    category: IssueCategory,
    since: datetime,
) -> list[Cluster]:
    """
    Transactional variant of list_recent_clusters_by_category(), for use
    from inside a @firestore.transactional function (specifically
    clustering.py's get_or_create_cluster()).

    Firestore requires every read performed inside a transaction
    function to go through transaction.get(query) rather than
    query.stream() directly — that's the mechanism by which Firestore
    tracks "this transaction read these documents" for optimistic-
    concurrency purposes on commit. A plain query.stream() call from
    inside a transactional function still executes and returns data,
    but isn't registered as a transactional read, which would silently
    defeat the "many citizens piling onto an existing cluster" race
    protection get_or_create_cluster() exists to provide — the whole
    point of wrapping that function in @firestore.transactional.

    Same filter shape as the non-transactional version, issued via
    transaction.get(...) instead of query.stream(...) — that's the only
    functional difference.
    """
    query = (
        db.collection(CLUSTERS_COLLECTION)
        .where(filter=FieldFilter("category", "==", category.value))
        .where(filter=FieldFilter("updated_at", ">=", since))
    )
    return [Cluster.from_dict(doc.id, doc.to_dict()) for doc in transaction.get(query)]


def list_recent_reports_by_categories(
    db: firestore.Client, categories: list[IssueCategory], since: datetime
) -> list[Report]:
    """
    Uses Firestore's `in` operator, capped at 30 values by Firestore
    itself — nowhere close to being tested here since callers only ever
    pass 2 categories (air_pollution, industrial_waste) for the
    air-quality-risk lookup.
    """
    category_values = [c.value for c in categories]
    query = (
        db.collection(REPORTS_COLLECTION)
        .where(filter=FieldFilter("category", "in", category_values))
        .where(filter=FieldFilter("created_at", ">=", since))
    )
    return [Report.from_dict(doc.id, doc.to_dict()) for doc in query.stream(timeout=_TIMEOUT)]


def list_reports_by_bounding_box(
    db: firestore.Client, min_lat: float, max_lat: float, min_lng: float, max_lng: float
) -> list[Report]:
    query = (
        db.collection(REPORTS_COLLECTION)
        .where(filter=FieldFilter("latitude", ">=", min_lat))
        .where(filter=FieldFilter("latitude", "<=", max_lat))
    )
    reports = [Report.from_dict(doc.id, doc.to_dict()) for doc in query.stream(timeout=_TIMEOUT)]
    return [r for r in reports if min_lng <= r.longitude <= max_lng]


def add_report_to_cluster_and_recount(db: firestore.Client, report: Report, cluster: Cluster) -> Cluster:
    """
    Writes the report, then re-queries all reports for that cluster to
    get a fresh, correct count — every report creation costs at least 2
    Firestore round-trips minimum (write report, read all reports in
    cluster) before severity/centroid recomputation even starts.
    """
    create_report(db, report)
    reports = list_reports_for_cluster(db, cluster.id)
    cluster.report_count = len(reports)
    return cluster