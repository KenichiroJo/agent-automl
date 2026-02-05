import { Loader2, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatStepEvent as StepEventType } from '@/types/events';
import { useMemo, useState } from 'react';

export function StepEvent({ id, name, createdAt, isRunning, threadId }: StepEventType) {
  const [isExpanded, setIsExpanded] = useState(isRunning); // 実行中は展開、完了後は折りたたむ

  const Icon = useMemo(() => {
    return isRunning ? Loader2 : CheckCircle2;
  }, [isRunning]);

  // Convert createdAt to Date if it's a string
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;

  // 完了したら自動的に折りたたむ
  useMemo(() => {
    if (!isRunning) {
      setIsExpanded(false);
    }
  }, [isRunning]);

  return (
    <div
      className={cn(
        'rounded-lg bg-card border border-border transition-all duration-200',
        isExpanded ? 'p-4' : 'p-2'
      )}
      data-step-id={id}
      data-thread-id={threadId}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {/* 展開/折りたたみアイコン */}
        <div className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </div>

        {/* ステータスアイコン */}
        <div className="flex-shrink-0">
          <div
            className={cn(
              'rounded-full flex items-center justify-center',
              isExpanded ? 'w-6 h-6' : 'w-4 h-4',
              isRunning ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'
            )}
          >
            <Icon className={cn(isExpanded ? 'w-3 h-3' : 'w-2 h-2', isRunning && 'animate-spin')} />
          </div>
        </div>

        {/* タイトル */}
        <span className={cn('font-medium truncate', isExpanded ? 'text-sm' : 'text-xs')}>
          {name}
        </span>

        {/* 時刻（折りたたみ時は非表示） */}
        {isExpanded && (
          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
            {date.toLocaleTimeString()}
          </span>
        )}
      </button>

      {/* 詳細（展開時のみ） */}
      {isExpanded && (
        <div className="mt-2 pl-8 text-xs text-muted-foreground">
          {isRunning ? '処理中...' : '完了'}
        </div>
      )}
    </div>
  );
}
