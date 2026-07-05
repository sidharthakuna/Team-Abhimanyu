"""
Severity scoring. Kept to a small number of explainable variables on
purpose: base severity by issue type, plus a bonus if 3+ reports confirm
the same cluster. This is meant to be describable in one sentence during
judge Q&A: "issue type score, plus 10 if 3+ reports confirm it."

EMERGENCY CATEGORIES (fire, see IssueCategory.is_emergency): these
bypass the above entirely. A single, unconfirmed fire report is not a
25-70 severity issue that becomes urgent once corroborated — it's
maximum urgency (100) the instant it's reported, no waiting required.
compute_severity() branches on this explicitly rather than trying to
force emergency categories through the same weights-plus-bonus formula
built for slow-building civic issues like garbage or sewage.

A sensitive-zone bonus (school/hospital proximity) is scaffolded but
disabled by default since it needs a zones dataset you may not have yet —
see the TODO below. Only applies to the non-emergency path, since
emergency categories are already at the maximum score.

NOTE: cluster.report_count is a plain stored field on the Cluster
dataclass (see app/models/report.py), kept in sync by
firestore_repo.add_report_to_cluster_and_recount(). This function trusts
that cluster.report_count is already accurate by the time it's called —
it does not re-query Firestore itself. Callers are responsible for
ensuring report_count is fresh before calling this (the router does this
correctly today; if you add a new call site, make sure you've updated
report_count first).
"""
from app.core.config import settings
from app.models.report import Cluster, IssueCategory

# Emergency categories always score at the ceiling — see module
# docstring. Kept as an explicit named constant (not a magic 100
# scattered inline) so a future "we want a second emergency tier, e.g.
# fire at 100 but gas-leak at 95" is a one-line change here.
EMERGENCY_SEVERITY_SCORE = 100


def compute_severity(cluster: Cluster) -> int:
    """
    Computes and returns the severity score for a cluster. Does NOT save
    it — caller is responsible for assigning it to cluster.severity_score
    and persisting via firestore_repo.update_cluster().

    Relies on cluster.report_count already being accurate — see the
    module docstring above. Not relevant for emergency categories, which
    skip the report_count-dependent bonus path entirely.
    """
    if cluster.category.is_emergency:
        return EMERGENCY_SEVERITY_SCORE

    base = settings.SEVERITY_BASE_WEIGHTS.get(cluster.category.value, 25)

    score = base

    if cluster.report_count >= settings.SEVERITY_DUPLICATE_THRESHOLD:
        score += settings.SEVERITY_DUPLICATE_BONUS

    # TODO (Tier 2, only if Day 3 checkpoint is solid): sensitive-zone bonus.
    # Needs a dataset of school/hospital coordinates for your target city.
    # Once you have one, check distance from cluster.latitude/longitude to
    # the nearest sensitive zone and add settings.SEVERITY_SENSITIVE_ZONE_BONUS
    # if within e.g. 200m. Uses the same _haversine_meters helper from
    # clustering.py — don't duplicate that function, import it.
    #
    # NOTE: with today's weights, the max reachable score on the
    # non-emergency path is 70 (industrial_waste) + 10 (duplicate bonus)
    # = 80, so the cap below never actually engages yet on that path.
    # That's fine — it's a safety net for a ceiling that becomes
    # reachable once the sensitive-zone bonus (or a new, heavier
    # category) is added, not a bug today.

    return min(score, 100)  # cap at 100 so the dashboard sort/display stays sane


# Simple department routing lookup — near-free to maintain, as planned.
_DEPARTMENT_ROUTING = {
    IssueCategory.garbage: "Solid Waste Management",
    IssueCategory.water_pollution: "Water Board",
    IssueCategory.air_pollution: "Pollution Control Board",
    IssueCategory.industrial_waste: "Pollution Control Board",
    IssueCategory.sewage: "Sewerage Board",
    IssueCategory.fire: "Fire Department",
    IssueCategory.other: "General Municipal Office",
}


def route_department(category: IssueCategory) -> str:
    return _DEPARTMENT_ROUTING.get(category, "General Municipal Office")