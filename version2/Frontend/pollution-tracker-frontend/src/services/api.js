// Thin wrapper around every backend endpoint. Each function here maps
// 1:1 to a route in app/routers/*.py — see the comment above each one
// for the exact backend file/function it calls.
//
// IMPORTANT: create_report and submit_after_photo hit endpoints that
// FastAPI declared with Form(...)/File(...) params (multipart), NOT a
// JSON body — see routers/reports.py's create_report signature and
// routers/verification.py's submit_after_photo signature. So these two
// MUST send FormData, not JSON, or FastAPI will reject them with a 422.

import { API_BASE_URL } from "./constants";

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function handleResponse(response) {
  if (!response.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      // response wasn't JSON (rare, but don't crash on it)
    }
    throw new ApiError(detail, response.status, detail);
  }
  return response.json();
}

// ---------- Reports (app/routers/reports.py) ----------

/**
 * POST /api/reports — create_report()
 * Multipart form: latitude, longitude, description?, address?, photo (file).
 * Matches ReportCreate's fields in schemas/report.py plus the photo file.
 */
export async function createReport({ latitude, longitude, description, address, photoFile }) {
  const formData = new FormData();
  formData.append("latitude", latitude);
  formData.append("longitude", longitude);
  if (description) formData.append("description", description);
  if (address) formData.append("address", address);
  formData.append("photo", photoFile);

  const response = await fetch(`${API_BASE_URL}/api/reports`, {
    method: "POST",
    body: formData,
    // No Content-Type header set manually — the browser sets the
    // correct multipart boundary automatically for FormData. Setting
    // it by hand is a common mistake that breaks the upload.
  });
  return handleResponse(response);
}

/**
 * GET /api/reports/clusters?status= — list_clusters()
 * Returns ClusterOutWithFade[], ranked by severity descending.
 * status is optional; omit the param entirely when not filtering.
 */
export async function listClusters(status) {
  const url = new URL(`${API_BASE_URL}/api/reports/clusters`);
  if (status) url.searchParams.set("status", status);
  const response = await fetch(url);
  return handleResponse(response);
}

/**
 * GET /api/reports/clusters/{cluster_id} — get_cluster()
 */
export async function getCluster(clusterId) {
  const response = await fetch(`${API_BASE_URL}/api/reports/clusters/${clusterId}`);
  return handleResponse(response);
}

/**
 * GET /api/reports/clusters/{cluster_id}/reports — get_cluster_reports()
 */
export async function getClusterReports(clusterId) {
  const response = await fetch(`${API_BASE_URL}/api/reports/clusters/${clusterId}/reports`);
  return handleResponse(response);
}

/**
 * GET /api/reports/clusters/{cluster_id}/map-markers — get_cluster_map_markers()
 * Returns MapMarkerOut[] — one 'before' marker per report, plus one
 * 'after' marker per report that has an after_photo_url.
 */
export async function getClusterMapMarkers(clusterId) {
  const response = await fetch(`${API_BASE_URL}/api/reports/clusters/${clusterId}/map-markers`);
  return handleResponse(response);
}

/**
 * PATCH /api/reports/clusters/{cluster_id}/status — update_cluster_status()
 * Body: { status: "pending" | "assigned" | "resolved" }
 */
export async function updateClusterStatus(clusterId, status) {
  const response = await fetch(`${API_BASE_URL}/api/reports/clusters/${clusterId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return handleResponse(response);
}

// ---------- Verification (app/routers/verification.py) ----------

/**
 * POST /api/verification/clusters/{cluster_id}/verify — submit_after_photo()
 * Multipart form: after_photo (file). Compares against the cluster's
 * original report photo and updates verification_status/confidence.
 */
export async function submitAfterPhoto(clusterId, afterPhotoFile) {
  const formData = new FormData();
  formData.append("after_photo", afterPhotoFile);

  const response = await fetch(`${API_BASE_URL}/api/verification/clusters/${clusterId}/verify`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(response);
}

// ---------- Air Quality (app/routers/air_quality.py) ----------

/**
 * GET /api/air-quality/risk?latitude=&longitude= — get_air_quality_risk()
 * Returns CombinedAirQualityOut: { citizen_report_risk, govt_air_quality }
 * govt_air_quality.available may be false — handle that in the UI
 * rather than treating a false value as an error.
 */
export async function getAirQualityRisk(latitude, longitude) {
  const url = new URL(`${API_BASE_URL}/api/air-quality/risk`);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  const response = await fetch(url);
  return handleResponse(response);
}

// ---------- Geocoding (app/routers/geocoding.py) ----------

/**
 * GET /api/geocoding/reverse?latitude=&longitude= — get_reverse_geocode()
 * Used ONLY by the "use my current location" flow to pre-fill a
 * human-readable address. Backend returns 502 if Nominatim has no
 * result — treat that as "no address available", not a hard failure,
 * matching how the backend itself degrades gracefully.
 */
export async function reverseGeocode(latitude, longitude) {
  const url = new URL(`${API_BASE_URL}/api/geocoding/reverse`);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  const response = await fetch(url);
  if (response.status === 502) {
    return { address: null }; // graceful degradation, same pattern as the backend
  }
  return handleResponse(response);
}

export { ApiError };