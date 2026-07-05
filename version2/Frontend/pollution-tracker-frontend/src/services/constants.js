// Single source of truth for every enum value that must match the
// FastAPI backend exactly (app/models/report.py). If the backend adds
// or renames a category/status, update ONLY this file.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Matches IssueCategory in app/models/report.py
export const ISSUE_CATEGORIES = {
  garbage: { label: "Garbage", icon: "🗑️", color: "#8B5E34", isEmergency: false },
  water_pollution: { label: "Water Pollution", icon: "💧", color: "#2E7BC0", isEmergency: false },
  air_pollution: { label: "Air Pollution", icon: "🌫️", color: "#7A7A7A", isEmergency: false },
  industrial_waste: { label: "Industrial Waste", icon: "🏭", color: "#B5651D", isEmergency: false },
  sewage: { label: "Sewage", icon: "🚰", color: "#5A4A3A", isEmergency: false },
  fire: { label: "Fire (Emergency)", icon: "🔥", color: "#D9342B", isEmergency: true },
  other: { label: "Other", icon: "❓", color: "#6B6B6B", isEmergency: false },
};

// Matches ReportStatus in app/models/report.py — Pending -> Assigned -> Resolved
// per routers/reports.py's update_cluster_status docstring.
export const REPORT_STATUS = {
  pending: { label: "Pending", color: "#D9342B" },
  assigned: { label: "Assigned", color: "#E0A100" },
  resolved: { label: "Resolved", color: "#2E9E4F" },
};

export const STATUS_ORDER = ["pending", "assigned", "resolved"];

// Matches VerificationStatus in app/models/report.py
export const VERIFICATION_STATUS = {
  not_verified: { label: "Not Verified", color: "#D9342B" },
  verified: { label: "Verified Resolved", color: "#2E9E4F" },
};

// PhotoType from app/models/report.py — drives red/green dot rendering
// per routers/reports.py's get_cluster_map_markers docstring.
export const PHOTO_TYPE = {
  before: { label: "Before", dotColor: "#D9342B" },
  after: { label: "After", dotColor: "#2E9E4F" },
};

export const USERNAME_STORAGE_KEY = "pollution_tracker_username";
export const ROLE_STORAGE_KEY = "pollution_tracker_role";

export const ROLES = {
  citizen: "citizen",
  municipal: "municipal",
};