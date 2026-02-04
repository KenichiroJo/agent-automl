/**
 * JobProgress Component
 *
 * バックグラウンドジョブの進捗を表示するコンポーネント
 */
import { XIcon } from 'lucide-react';

import { Job } from '@/api/jobs';
import {
  formatProgress,
  getJobStatusColor,
  getJobStatusLabel,
} from '@/hooks/use-jobs';

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface JobProgressProps {
  /** ジョブ情報 */
  job: Job;
  /** キャンセルボタンのクリックハンドラ */
  onCancel?: (jobId: string) => void;
  /** 閉じるボタンのクリックハンドラ */
  onClose?: () => void;
  /** コンパクト表示 */
  compact?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function JobProgress({
  job,
  onCancel,
  onClose,
  compact = false,
}: JobProgressProps) {
  const isRunning = ['pending', 'running'].includes(job.status);
  const isFailed = job.status === 'failed';
  const progressColor = isFailed ? 'error' : isRunning ? 'default' : 'success';

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white truncate">
              {job.job_type}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full bg-gray-700 ${getJobStatusColor(job.status)}`}
            >
              {getJobStatusLabel(job.status)}
            </span>
          </div>
          <Progress value={job.progress * 100} color={progressColor} size="sm" />
        </div>
        {isRunning && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancel(job.job_id)}
            className="text-gray-400 hover:text-red-400"
          >
            <XIcon className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            {getJobTypeLabel(job.job_type)}
            <span
              className={`text-xs px-2 py-0.5 rounded-full bg-gray-700 ${getJobStatusColor(job.status)}`}
            >
              {getJobStatusLabel(job.status)}
            </span>
          </CardTitle>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <XIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 進捗バー */}
        <div>
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>{job.message || 'Processing...'}</span>
            <span>{formatProgress(job.progress)}</span>
          </div>
          <Progress value={job.progress * 100} color={progressColor} size="md" />
        </div>

        {/* エラー表示 */}
        {job.error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-sm text-red-300">{job.error}</p>
          </div>
        )}

        {/* アクションボタン */}
        {isRunning && onCancel && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(job.job_id)}
              className="text-red-400 border-red-400 hover:bg-red-400/10"
            >
              キャンセル
            </Button>
          </div>
        )}

        {/* メタ情報 */}
        <div className="text-xs text-gray-500 flex justify-between">
          <span>作成: {formatDate(job.created_at)}</span>
          <span>更新: {formatDate(job.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Job List Component
// ─────────────────────────────────────────────────────────────

interface JobListProps {
  /** ジョブ一覧 */
  jobs: Job[];
  /** キャンセルハンドラ */
  onCancel?: (jobId: string) => void;
  /** 空の場合のメッセージ */
  emptyMessage?: string;
}

export function JobList({
  jobs,
  onCancel,
  emptyMessage = '実行中のジョブはありません',
}: JobListProps) {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <JobProgress key={job.job_id} job={job} onCancel={onCancel} compact />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Active Jobs Indicator
// ─────────────────────────────────────────────────────────────

interface ActiveJobsIndicatorProps {
  /** アクティブジョブ数 */
  count: number;
  /** クリックハンドラ */
  onClick?: () => void;
}

export function ActiveJobsIndicator({
  count,
  onClick,
}: ActiveJobsIndicatorProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-[#81FBA5] text-gray-900 rounded-full shadow-lg hover:bg-[#6de090] transition-colors"
    >
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-900 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-gray-900" />
      </span>
      <span className="font-medium">
        {count} 件のジョブが実行中
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function getJobTypeLabel(jobType: string): string {
  const labels: Record<string, string> = {
    autopilot_monitor: 'AutoPilot 監視',
    batch_prediction: 'バッチ予測',
    model_training: 'モデル学習',
  };
  return labels[jobType] || jobType;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

// ─────────────────────────────────────────────────────────────
// Card exports (re-export for convenience)
// ─────────────────────────────────────────────────────────────

export { Card, CardContent, CardHeader, CardTitle } from './ui/card';
