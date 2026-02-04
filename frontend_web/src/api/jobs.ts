/**
 * Jobs API Client
 *
 * バックグラウンドジョブ管理の API クライアント
 */
import apiClient from './apiClient';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Job {
  job_id: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  message: string;
  created_at: string;
  updated_at: string;
  error?: string | null;
}

export interface CreateAutoPilotMonitorRequest {
  project_id: string;
}

export interface CreateAutoPilotMonitorResponse {
  job_id: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────

/**
 * ユーザーのジョブ一覧を取得
 */
export async function getJobs(): Promise<Job[]> {
  const response = await apiClient.get<Job[]>('/api/v1/jobs');
  return response.data;
}

/**
 * 特定のジョブを取得
 */
export async function getJob(jobId: string): Promise<Job> {
  const response = await apiClient.get<Job>(`/api/v1/jobs/${jobId}`);
  return response.data;
}

/**
 * 実行中のジョブ一覧を取得
 */
export async function getActiveJobs(): Promise<Job[]> {
  const response = await apiClient.get<Job[]>('/api/v1/jobs/active');
  return response.data;
}

/**
 * ジョブをキャンセル
 */
export async function cancelJob(jobId: string): Promise<Job> {
  const response = await apiClient.post<Job>(`/api/v1/jobs/${jobId}/cancel`);
  return response.data;
}

/**
 * AutoPilot 監視ジョブを作成
 */
export async function createAutoPilotMonitor(
  projectId: string
): Promise<CreateAutoPilotMonitorResponse> {
  const response = await apiClient.post<CreateAutoPilotMonitorResponse>(
    '/api/v1/jobs/autopilot-monitor',
    { project_id: projectId }
  );
  return response.data;
}
