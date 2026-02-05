/**
 * ContextBar - 現在のコンテキストを表示するヘッダーバー
 *
 * 選択中のプロジェクト → モデルをパンくず形式で表示
 */
import { FolderOpen, Brain, ChevronRight, X, Moon, Sun, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ContextBarProject {
  id: string;
  name: string;
}

export interface ContextBarModel {
  id: string;
  name: string;
  score?: number;
  metric?: string;
}

export interface ContextBarProps {
  /** 選択中のプロジェクト */
  project?: ContextBarProject;
  /** 選択中のモデル */
  model?: ContextBarModel;
  /** プロジェクトクリア時のコールバック */
  onClearProject?: () => void;
  /** モデルクリア時のコールバック */
  onClearModel?: () => void;
  /** ダークモードかどうか */
  isDark?: boolean;
  /** ダークモード切り替え */
  onToggleDark?: () => void;
  className?: string;
}

export function ContextBar({
  project,
  model,
  onClearProject,
  onClearModel,
  isDark = false,
  onToggleDark,
  className,
}: ContextBarProps) {
  const hasContext = project || model;

  return (
    <header
      className={cn(
        'flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-card via-card to-card/80 backdrop-blur-sm',
        className
      )}
    >
      {/* 左側: ロゴとコンテキスト */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {/* ロゴ */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#81FBA5]/30 to-[#81FBA5]/10 flex items-center justify-center border border-[#81FBA5]/30 shadow-sm">
            <span className="text-xl">🤖</span>
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-foreground block leading-tight">
              DataRobot Agent
            </span>
            <span className="text-xs text-muted-foreground">AutoML / MLOps Assistant</span>
          </div>
        </div>

        {/* コンテキストパンくず */}
        {hasContext && (
          <div className="flex items-center gap-2 text-sm overflow-hidden">
            <div className="w-px h-6 bg-border/50" />

            {/* プロジェクト */}
            {project && (
              <div className="flex items-center gap-1 min-w-0">
                <Badge
                  variant="secondary"
                  className="gap-1.5 max-w-[200px] truncate cursor-default bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                >
                  <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{project.name}</span>
                  {onClearProject && (
                    <button
                      type="button"
                      onClick={onClearProject}
                      className="ml-1 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              </div>
            )}

            {/* モデル */}
            {model && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Badge
                  variant="secondary"
                  className="gap-1.5 max-w-[250px] truncate cursor-default bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                >
                  <Brain className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{model.name}</span>
                  {model.score !== undefined && model.metric && (
                    <span className="text-[10px] opacity-75 ml-1">
                      ({model.metric}: {model.score.toFixed(3)})
                    </span>
                  )}
                  {onClearModel && (
                    <button
                      type="button"
                      onClick={onClearModel}
                      className="ml-1 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              </>
            )}
          </div>
        )}
      </div>

      {/* 右側: アクションボタン */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onToggleDark && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleDark}
            className="h-9 w-9 p-0 rounded-lg hover:bg-muted/50"
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg hover:bg-muted/50">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

export default ContextBar;
