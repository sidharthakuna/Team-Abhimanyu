import type {
  ClusterOut,
  CreateReportPayload,
  ForecastResult,
  FusionMatrix,
  GlobalMatrix,
  PlaceName,
  ReportOut,
  ReportStatus,
  VerificationResult,
} from '../types';

// Points at your local FastAPI server by default. Override at build time
// with VITE_API_BASE if you deploy the backend elsewhere — e.g. an .env
// file containing VITE_API_BASE=https://your-api.example.com
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    // Network failure — most commonly the FastAPI server isn't running,
    // or is running on a different port than API_BASE points at.
    throw new ApiError(
      `Can't reach the server at ${API_BASE}. Is the FastAPI backend running?`,
      0,
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* body wasn't JSON — keep statusText */
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

export const API = {
  // ---- Reports ----
  // POST /api/reports  (multipart/form-data: latitude, longitude,
  // phone_number, description?, photo) — matches create_report() exactly
  async createReport({
    latitude,
    longitude,
    phoneNumber,
    description,
    photoFile,
  }: CreateReportPayload): Promise<ReportOut> {
    const form = new FormData();
    form.append('latitude', String(latitude));
    form.append('longitude', String(longitude));
    form.append('phone_number', phoneNumber);
    if (description) form.append('description', description);
    form.append('photo', photoFile);
    return apiRequest<ReportOut>('/api/reports', { method: 'POST', body: form });
  },

  // GET /api/reports/clusters?status=pending|assigned|resolved
  async listClusters(status?: ReportStatus): Promise<ClusterOut[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiRequest<ClusterOut[]>(`/api/reports/clusters${q}`);
  },

  // GET /api/reports/clusters/{cluster_id}
  async getCluster(clusterId: string): Promise<ClusterOut> {
    return apiRequest<ClusterOut>(`/api/reports/clusters/${clusterId}`);
  },

  // GET /api/reports/clusters/{cluster_id}/reports
  async getClusterReports(clusterId: string): Promise<ReportOut[]> {
    return apiRequest<ReportOut[]>(`/api/reports/clusters/${clusterId}/reports`);
  },

  // PATCH /api/reports/clusters/{cluster_id}/status  { status }
  async updateClusterStatus(clusterId: string, status: ReportStatus): Promise<ClusterOut> {
    return apiRequest<ClusterOut>(`/api/reports/clusters/${clusterId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  },

  // DELETE /api/reports/clusters/{cluster_id}
  async deleteCluster(clusterId: string): Promise<null> {
    return apiRequest<null>(`/api/reports/clusters/${clusterId}`, { method: 'DELETE' });
  },

  // ---- Verification ----
  // POST /api/verification/clusters/{cluster_id}/verify (multipart: after_photo)
  async submitVerification(
    clusterId: string,
    afterPhotoFile: File,
  ): Promise<VerificationResult> {
    const form = new FormData();
    form.append('after_photo', afterPhotoFile);
    return apiRequest<VerificationResult>(`/api/verification/clusters/${clusterId}/verify`, {
      method: 'POST',
      body: form,
    });
  },

  // ---- Analytics ----
  // GET /api/analytics/global-matrix?latitude=&longitude=
  async getGlobalMatrix(latitude?: number, longitude?: number): Promise<GlobalMatrix> {
    const q = new URLSearchParams();
    if (latitude != null) q.set('latitude', String(latitude));
    if (longitude != null) q.set('longitude', String(longitude));
    const qs = q.toString();
    return apiRequest<GlobalMatrix>(`/api/analytics/global-matrix${qs ? `?${qs}` : ''}`);
  },

  // GET /api/analytics/fusion/{cluster_id}
  async getFusionMatrix(clusterId: string): Promise<FusionMatrix> {
    return apiRequest<FusionMatrix>(`/api/analytics/fusion/${clusterId}`);
  },

  // GET /api/analytics/forecast?latitude=&longitude=&hours=
  async getForecast(latitude: number, longitude: number, hours = 48): Promise<ForecastResult> {
    const q = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hours: String(hours),
    });
    return apiRequest<ForecastResult>(`/api/analytics/forecast?${q}`);
  },

  // GET /api/analytics/forecast/cluster/{cluster_id}?hours=
  async getForecastForCluster(clusterId: string, hours = 48): Promise<ForecastResult> {
    return apiRequest<ForecastResult>(
      `/api/analytics/forecast/cluster/${clusterId}?hours=${hours}`,
    );
  },

  // GET /api/analytics/place-name?latitude=&longitude=
  async getPlaceName(latitude: number, longitude: number): Promise<PlaceName> {
    const q = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
    return apiRequest<PlaceName>(`/api/analytics/place-name?${q}`);
  },

  // ---- Auth (Twilio Verify — matches app/routers/auth.py) ----
  // POST /api/auth/send-otp  (form: phone_number)
  async sendOtp(phoneNumber: string): Promise<{ status: string; message?: string; sid?: string }> {
    const form = new FormData();
    form.append('phone_number', phoneNumber);
    return apiRequest('/api/auth/send-otp', { method: 'POST', body: form });
  },

  // POST /api/auth/verify-otp  (form: phone_number, code)
  async verifyOtp(
    phoneNumber: string,
    code: string,
  ): Promise<{ status: string; message?: string }> {
    const form = new FormData();
    form.append('phone_number', phoneNumber);
    form.append('code', code);
    return apiRequest('/api/auth/verify-otp', { method: 'POST', body: form });
  },
};

export { ApiError };
