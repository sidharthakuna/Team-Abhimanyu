from app.core.config import settings
from app.models.report import IssueCategory

def compute_severity(cluster_dict: dict) -> int:
    """
    Calculates a dynamic operational priority metric (0-100 score).
    """
    category = cluster_dict.get("category", "other")
    # Defensively unpack if it lingers as an Enum object inside the dict structure
    category_str = category.value if hasattr(category, 'value') else str(category)
    
    # 1. Base Weight Lookup
    base_score = settings.SEVERITY_BASE_WEIGHTS.get(category_str, 25)
    
    # 2. Volume/Escalation Accumulation
    report_count = cluster_dict.get("report_count", 1)
    volume_bonus = 0
    if report_count >= settings.SEVERITY_DUPLICATE_THRESHOLD:
        volume_bonus = settings.SEVERITY_DUPLICATE_BONUS
        
    final_score = base_score + volume_bonus
    return min(100, max(0, final_score))

_DEPARTMENT_ROUTING = {
    IssueCategory.garbage.value: "Solid Waste Management",
    IssueCategory.water_pollution.value: "Water Board",
    IssueCategory.air_pollution.value: "Pollution Control Board",
    IssueCategory.industrial_waste.value: "Pollution Control Board",
    IssueCategory.sewage.value: "Sewerage Board",
    IssueCategory.other.value: "General Municipal Office",
}

def route_department(category) -> str:
    """
    Maps an issue category to the responsible municipal department.
    Handles both Enum types and raw fallback strings dynamically.
    """
    # Extract the raw string key cleanly whether it's an Enum or string
    category_key = category.value if hasattr(category, 'value') else str(category)
    return _DEPARTMENT_ROUTING.get(category_key, "General Municipal Office")