/**
 * QuickActions - クイックアクションバー
 *
 * よく使う操作をワンクリックで実行できるボタン群
 */
import { FolderSearch, BarChart3, TrendingUp, LineChart, Rocket, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  disabled?: boolean;
}

export interface QuickActionsProps {
  /** 現在のプロジェクトが選択されているか */
  hasProject?: boolean;
  /** 現在のモデルが選択されているか */
  hasModel?: boolean;
  /** アクション実行時のコールバック */
  onAction: (prompt: string) => void;
  /** エージェントが実行中か */
  isRunning?: boolean;
  /** カスタムアクション */
  customActions?: QuickAction[];
  className?: string;
}

const defaultActions: QuickAction[] = [
  {
    id: 'list-projects',
    label: 'プロジェクト一覧',
    icon: <FolderSearch className="h-4 w-4" />,
    prompt: 'プロジェクト一覧を表示してください',
  },
  {
    id: 'model-comparison',
    label: 'モデル比較',
    icon: <BarChart3 className="h-4 w-4" />,
    prompt: 'このプロジェクトのモデル一覧を表示してください',
  },
  {
    id: 'feature-impact',
    label: 'Feature Impact',
    icon: <TrendingUp className="h-4 w-4" />,
    prompt: 'このモデルのFeature Impact（特徴量重要度）を表示してください',
  },
  {
    id: 'roc-curve',
    label: 'ROC曲線',
    icon: <LineChart className="h-4 w-4" />,
    prompt: 'このモデルのROC曲線を表示してください',
  },
  {
    id: 'deploy',
    label: 'デプロイ',
    icon: <Rocket className="h-4 w-4" />,
    prompt: 'このモデルをデプロイする方法を教えてください',
  },
];

export function QuickActions({
  hasProject = false,
  hasModel = false,
  onAction,
  isRunning = false,
  customActions,
  className,
}: QuickActionsProps) {
  const actions = customActions || defaultActions;

  // アクションの有効/無効を判定
  const getActionState = (actionId: string): boolean => {
    switch (actionId) {
      case 'list-projects':
        return false; // 常に有効
      case 'model-comparison':
        return !hasProject; // プロジェクト選択が必要
      case 'feature-impact':
      case 'roc-curve':
      case 'deploy':
        return !hasModel; // モデル選択が必要
      default:
        return false;
    }
  };

  return (
    <div className={cn('px-4 py-3 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent', className)}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-5 bg-[#81FBA5] rounded-full" />
        <RefreshCw className="h-4 w-4 text-[#81FBA5]" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          クイックアクション
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isDisabled = isRunning || getActionState(action.id);
          return (
            <Button
              key={action.id}
              variant="outline"
              size="sm"
              onClick={() => onAction(action.prompt)}
              disabled={isDisabled}
              className={cn(
                'gap-2 text-xs h-9 rounded-lg border-border/50 bg-card/50 backdrop-blur-sm transition-all',
                !isDisabled && 'hover:bg-[#81FBA5]/10 hover:border-[#81FBA5]/50 hover:shadow-sm'
              )}
            >
              {action.icon}
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default QuickActions;
