import { ISSUE_CATEGORIES, REPORT_STATUS, VERIFICATION_STATUS } from "../services/constants";

export function getCategoryInfo(categoryKey) {
  return ISSUE_CATEGORIES[categoryKey] || ISSUE_CATEGORIES.other;
}

export function getStatusInfo(statusKey) {
  return REPORT_STATUS[statusKey] || REPORT_STATUS.pending;
}

export function getVerificationInfo(verificationKey) {
  return VERIFICATION_STATUS[verificationKey] || VERIFICATION_STATUS.not_verified;
}

export function formatDistanceToNow(dateString) {
  const then = new Date(dateString);
  const diffMs = Date.now() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatCoords(latitude, longitude) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}