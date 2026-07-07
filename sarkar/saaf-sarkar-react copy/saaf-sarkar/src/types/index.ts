// Mirrors app/models/report.py + app/schemas/report.py exactly.
// Any drift here is a silent bug against the real backend, so keep
// these enums and field names byte-for-byte aligned with Python.

export type IssueCategory =
  | 'garbage'
  | 'water_pollution'
  | 'air_pollution'
  | 'industrial_waste'
  | 'sewage'
  | 'other';

export type ReportStatus = 'pending' | 'assigned' | 'resolved';

export type VerificationStatus =
  | 'not_submitted'
  | 'pending_review'
  | 'verified'
  | 'not_verified';

export interface ClusterOut {
  id: string;
  latitude: number;
  longitude: number;
  category: IssueCategory;
  severity_score: number;
  status: ReportStatus;
  assigned_department: string | null;
  verification_status: VerificationStatus;
  verification_confidence: number | null;
  municipal_summary: string | null;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReportOut {
  id: string;
  cluster_id: string;
  photo_url: string;
  after_photo_url: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  category: IssueCategory;
  ai_confidence: number | null;
  is_duplicate_of_cluster: boolean;
  created_at: string;
}

export interface CreateReportPayload {
  latitude: number;
  longitude: number;
  phoneNumber: string;
  description?: string;
  photoFile: File;
}

export interface GlobalMatrix {
  active_hotspots: number;
  resolved_tickets: number;
  ambient_pm25: number | null;
  ambient_pm10: number | null;
  ambient_humidity: number | null;
  ambient_temperature_c: number | null;
  european_aqi: number | null;
  is_live: boolean;
  data_source: string;
  attribution: string;
}

export interface FusionMatrix {
  cluster_id: string;
  is_simulated_estimate: boolean;
  high_confidence_hotspot: boolean;
  metrics: {
    ground_citizen_reports: number;
    estimated_severity_index: number;
  };
  resource_deployment: {
    recommended_assets: string;
    urgency: 'CRITICAL' | 'MEDIUM';
  };
  methodology_note: string;
}

export interface ForecastPoint {
  time: string;
  pm2_5: number | null;
  european_aqi: number | null;
}

export interface ForecastResult {
  points: ForecastPoint[];
  is_live: boolean;
}

export interface PlaceName {
  display_name: string | null;
  is_live: boolean;
}

export interface VerificationResult extends ClusterOut {
  // /api/verification/clusters/{id}/verify returns the updated cluster dict
}

export interface Coords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type UserRole = 'citizen' | 'municipal';

export interface SessionData {
  role: UserRole;
  phoneNumber?: string;
  employeeId?: string;
  department?: string | null;
}
