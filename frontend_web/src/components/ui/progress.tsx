import * as React from 'react';

import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Progress Bar Component
// ─────────────────────────────────────────────────────────────

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 進捗値 (0-100) */
  value: number;
  /** 最大値 */
  max?: number;
  /** バーの色 */
  color?: 'default' | 'success' | 'warning' | 'error';
  /** サイズ */
  size?: 'sm' | 'md' | 'lg';
  /** ラベルを表示するか */
  showLabel?: boolean;
}

const colorClasses = {
  default: 'bg-[#81FBA5]',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
};

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export function Progress({
  value,
  max = 100,
  color = 'default',
  size = 'md',
  showLabel = false,
  className,
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('w-full', className)} {...props}>
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>進捗</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        className={cn(
          'w-full bg-gray-700 rounded-full overflow-hidden',
          sizeClasses[size]
        )}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            colorClasses[color]
          )}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}

Progress.displayName = 'Progress';
