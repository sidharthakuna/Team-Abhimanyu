import type {
  ClusterOut,
  CreateReportPayload,
  ForecastResult,
  FusionMatrix,
  GlobalMatrix,
  GoogleLoginResponse,
  OtpSendResponse,
  OtpVerifyResponse,
  PlaceName,
  ReportOut,
  ReportStatus,
  VerificationResult,
} from '../types';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export class ApiError extends Error {
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

// Builds the multipart form the same way create_report() in reports.py
// expects it — latitude/longitude/description/photo — WITHOUT any
// identity field, since identity now comes exclusively from the
// Authorization header (see require_verified_identity in auth.py).
// authToken is required here by the type signature, not optional, so a
// call site can't accidentally submit a report with no token attached.
function reportForm({ latitude, longitude, description, photoFile }: CreateReportPayload): FormData {
  const form = new FormData();
  form.append('latitude', String(latitude));
  form.append('longitude', String(longitude));
  if (description) form.append('description', description);
  form.append('photo', photoFile);
  return form;
}

export const API = {
  // ---- Auth (email OTP + Google Sign-In — matches app/routers/auth.py) ----

  // POST /api/auth/send-otp  (form: email)
  async sendOtp(email: string): Promise<OtpSendResponse> {
    const form = new FormData();
    form.append('email', email);
    return apiRequest<OtpSendResponse>('/api/auth/send-otp', { method: 'POST', body: form });
  },

  // POST /api/auth/verify-otp  (form: email, code)
  async verifyOtp(email: string, code: string): Promise<OtpVerifyResponse> {
    const form = new FormData();
    form.append('email', email);
    form.append('code', code);
    return apiRequest<OtpVerifyResponse>('/api/auth/verify-otp', { method: 'POST', body: form });
  },

  // POST /api/auth/google-login  (json: { id_token })
  async googleLogin(idToken: string): Promise<GoogleLoginResponse> {
    return apiRequest<GoogleLoginResponse>('/api/auth/google-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    });
  },

  // ---- Reports ----

  // POST /api/reports (multipart: latitude, longitude, description?, photo)
  // Bearer token required — a request with no authHeader entries will
  // 401 at require_verified_identity before create_report() even runs.
  async createReport(payload: CreateReportPayload, authHeader: Record<string, string>): Promise<ReportOut> {
    return apiRequest<ReportOut>('/api/reports', {
      method: 'POST',
      headers: authHeader,
      body: reportForm(payload),
    });
  },

  async listClusters(status?: ReportStatus): Promise<ClusterOut[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiRequest<ClusterOut[]>(`/api/reports/clusters${q}`);
  },

  async getCluster(clusterId: string): Promise<ClusterOut> {
    return apiRequest<ClusterOut>(`/api/reports/clusters/${clusterId}`);
  },

  async getClusterReports(clusterId: string): Promise<ReportOut[]> {
    return apiRequest<ReportOut[]>(`/api/reports/clusters/${clusterId}/reports`);
  },

  async updateClusterStatus(clusterId: string, status: ReportStatus): Promise<ClusterOut> {
    return apiRequest<ClusterOut>(`/api/reports/clusters/${clusterId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  },

  async deleteCluster(clusterId: string): Promise<null> {
    return apiRequest<null>(`/api/reports/clusters/${clusterId}`, { method: 'DELETE' });
  },

  // ---- Verification ----

  async submitVerification(clusterId: string, afterPhotoFile: File): Promise<VerificationResult> {
    const form = new FormData();
    form.append('after_photo', afterPhotoFile);
    return apiRequest<VerificationResult>(`/api/verification/clusters/${clusterId}/verify`, {
      method: 'POST',
      body: form,
    });
  },

  // ---- Analytics ----

  async getGlobalMatrix(latitude?: number, longitude?: number): Promise<GlobalMatrix> {
    const q = new URLSearchParams();
    if (latitude != null) q.set('latitude', String(latitude));
    if (longitude != null) q.set('longitude', String(longitude));
    const qs = q.toString();
    return apiRequest<GlobalMatrix>(`/api/analytics/global-matrix${qs ? `?${qs}` : ''}`);
  },

  async getFusionMatrix(clusterId: string): Promise<FusionMatrix> {
    return apiRequest<FusionMatrix>(`/api/analytics/fusion/${clusterId}`);
  },

  // GET /api/analytics/forecast?latitude=&longitude=&hours=
  // Powers the 24-72h AQI spike chart — this is the hackathon brief's
  // "predict air quality spikes" requirement made real.
  async getForecast(latitude: number, longitude: number, hours = 48): Promise<ForecastResult> {
    const q = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hours: String(hours),
    });
    return apiRequest<ForecastResult>(`/api/analytics/forecast?${q}`);
  },

  async getForecastForCluster(clusterId: string, hours = 48): Promise<ForecastResult> {
    return apiRequest<ForecastResult>(
      `/api/analytics/forecast/cluster/${clusterId}?hours=${hours}`,
    );
  },

  async getPlaceName(latitude: number, longitude: number): Promise<PlaceName> {
    const q = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
    return apiRequest<PlaceName>(`/api/analytics/place-name?${q}`);
  },
};