/**
 * useJobs Hook
 *
 * バックグラウンドジョブの状態管理と進捗監視
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelJob as apiCancelJob,
  createAutoPilotMonitor,
  getActiveJobs,
  getJob,
  getJobs,
  Job,
  JobStatus,
} from '@/api/jobs';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface UseJobsOptions {
  /** ポーリング間隔（ミリ秒）。0 でポーリング無効 */
  pollInterval?: number;
  /** アクティブジョブのみを追跡するか */
  activeOnly?: boolean;
}

export interface UseJobsReturn {
  /** ジョブ一覧 */
  jobs: Job[];
  /** 読み込み中フラグ */
  isLoading: boolean;
  /** エラー */
  error: Error | null;
  /** ジョブ一覧を再取得 */
  refresh: () => Promise<void>;
  /** ジョブをキャンセル */
  cancelJob: (jobId: string) => Promise<void>;
  /** AutoPilot 監視を開始 */
  startAutoPilotMonitor: (projectId: string) => Promise<string>;
}

// ─────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────

/**
 * ジョブ一覧を管理するフック
 *
 * @example
 * ```tsx
 * const { jobs, isLoading, startAutoPilotMonitor } = useJobs({
 *   pollInterval: 5000,  // 5秒ごとに更新
 * });
 *
 * // AutoPilot 監視を開始
 * const jobId = await startAutoPilotMonitor('project_id');
 * ```
 */
export function useJobs(options: UseJobsOptions = {}): UseJobsReturn {
  const { pollInterval = 5000, activeOnly = false } = options;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ジョブ一覧を取得
  const fetchJobs = useCallback(async () => {
    try {
      const data = activeOnly ? await getActiveJobs() : await getJobs();
      setJobs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch jobs'));
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  // 初回読み込みとポーリング設定
  useEffect(() => {
    fetchJobs();

    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchJobs, pollInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchJobs, pollInterval]);

  // ジョブキャンセル
  const cancelJob = useCallback(
    async (jobId: string) => {
      await apiCancelJob(jobId);
      await fetchJobs();
    },
    [fetchJobs]
  );

  // AutoPilot 監視開始
  const startAutoPilotMonitor = useCallback(
    async (projectId: string): Promise<string> => {
      const response = await createAutoPilotMonitor(projectId);
      await fetchJobs();
      return response.job_id;
    },
    [fetchJobs]
  );

  return {
    jobs,
    isLoading,
    error,
    refresh: fetchJobs,
    cancelJob,
    startAutoPilotMonitor,
  };
}

// ─────────────────────────────────────────────────────────────
// Single Job Hook
// ─────────────────────────────────────────────────────────────

export interface UseJobOptions {
  /** ポーリング間隔（ミリ秒）。0 でポーリング無効 */
  pollInterval?: number;
  /** 完了時にポーリングを停止するか */
  stopOnComplete?: boolean;
}

export interface UseJobReturn {
  /** ジョブ情報 */
  job: Job | null;
  /** 読み込み中フラグ */
  isLoading: boolean;
  /** エラー */
  error: Error | null;
  /** 再取得 */
  refresh: () => Promise<void>;
  /** ジョブが完了したか */
  isComplete: boolean;
  /** ジョブが実行中か */
  isRunning: boolean;
}

/**
 * 単一のジョブを監視するフック
 *
 * @example
 * ```tsx
 * const { job, isComplete, isRunning } = useJob(jobId, {
 *   pollInterval: 2000,
 *   stopOnComplete: true,
 * });
 *
 * if (isRunning) {
 *   return <ProgressBar value={job.progress * 100} />;
 * }
 * ```
 */
export function useJob(
  jobId: string | null,
  options: UseJobOptions = {}
): UseJobReturn {
  const { pollInterval = 2000, stopOnComplete = true } = options;

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isComplete = job
    ? ['completed', 'failed', 'cancelled'].includes(job.status)
    : false;

  const isRunning = job
    ? ['pending', 'running'].includes(job.status)
    : false;

  // ジョブを取得
  const fetchJob = useCallback(async () => {
    if (!jobId) {
      setJob(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await getJob(jobId);
      setJob(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch job'));
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // 初回読み込みとポーリング設定
  useEffect(() => {
    fetchJob();

    if (pollInterval > 0 && jobId) {
      intervalRef.current = setInterval(fetchJob, pollInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchJob, pollInterval, jobId]);

  // 完了時にポーリング停止
  useEffect(() => {
    if (stopOnComplete && isComplete && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isComplete, stopOnComplete]);

  return {
    job,
    isLoading,
    error,
    refresh: fetchJob,
    isComplete,
    isRunning,
  };
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

/**
 * ジョブステータスに対応する色を取得
 */
export function getJobStatusColor(status: JobStatus): string {
  const colors: Record<JobStatus, string> = {
    pending: 'text-yellow-500',
    running: 'text-blue-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
    cancelled: 'text-gray-500',
  };
  return colors[status] || 'text-gray-500';
}

/**
 * ジョブステータスに対応するラベルを取得
 */
export function getJobStatusLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    pending: '待機中',
    running: '実行中',
    completed: '完了',
    failed: '失敗',
    cancelled: 'キャンセル',
  };
  return labels[status] || status;
}

/**
 * 進捗率をパーセント表示に変換
 */
export function formatProgress(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}
