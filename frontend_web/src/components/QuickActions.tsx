/**
 * QuickActions - クイックアクションバー
 *
 * よく使う操作をワンクリックで実行できるボタン群
 * インサイト機能（Feature Impact, ROC曲線等）への素早いアクセスを提供
 */
import { 
  FolderSearch, 
  BarChart3, 
  TrendingUp, 
  LineChart, 
  Rocket, 
  RefreshCw,
  Info,
  HelpCircle,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  disabled?: boolean;
  /** アクションのカテゴリ（グループ分け用） */
  category?: 'basic' | 'insight' | 'action';
}

export interface QuickActionsProps {
  /** 現在のプロジェクトが選択されているか */
  hasProject?: boolean;
  /** 現在のモデルが選択されているか */
  hasModel?: boolean;
  /** 現在のプロジェクトID */
  currentProjectId?: string;
  /** 現在のモデルID */
  currentModelId?: string;
  /** アクション実行時のコールバック */
  onAction: (prompt: string) => void;
  /** エージェントが実行中か */
  isRunning?: boolean;
  /** カスタムアクション */
  customActions?: QuickAction[];
  className?: string;
}

/**
 * プロジェクトIDとモデルIDを含むプロンプトを生成
 */
function buildPromptWithContext(
  basePrompt: string, 
  projectId?: string, 
  modelId?: string
): string {
  const parts = [basePrompt];
  if (projectId) {
    parts.push(`（プロジェクトID: ${projectId}）`);
  }
  if (modelId) {
    parts.push(`（モデルID: ${modelId}）`);
  }
  return parts.join('');
}

const defaultActions: QuickAction[] = [
  // 基本操作
  {
    id: 'list-projects',
    label: 'プロジェクト一覧',
    icon: <FolderSearch className="h-4 w-4" />,
    prompt: 'プロジェクト一覧を表示してください。番号とプロジェクト名、作成日を表で見せてください。詳細を確認したいプロジェクトがあれば番号で選択できます。',
    category: 'basic',
  },
  {
    id: 'model-comparison',
    label: 'モデル比較',
    icon: <BarChart3 className="h-4 w-4" />,
    prompt: 'このプロジェクトのモデル一覧を比較表で表示してください。AUC、LogLoss等の精度指標と、推奨モデルを教えてください。',
    category: 'basic',
  },
  // インサイト機能
  {
    id: 'feature-impact',
    label: '特徴量重要度',
    icon: <TrendingUp className="h-4 w-4" />,
    prompt: 'このモデルのFeature Impact（特徴量重要度）を上位10件表示してください。どの特徴量が予測に最も影響しているか、ビジネス観点での解釈も含めて説明してください。',
    category: 'insight',
  },
  {
    id: 'roc-curve',
    label: 'ROC曲線',
    icon: <LineChart className="h-4 w-4" />,
    prompt: 'このモデルのROC曲線とAUC値を表示してください。モデルの判別力について解説してください。',
    category: 'insight',
  },
  {
    id: 'lift-chart',
    label: 'リフトチャート',
    icon: <ArrowUpDown className="h-4 w-4" />,
    prompt: 'このモデルのリフトチャートを表示してください。上位何%でどれだけのターゲットをカバーできるか教えてください。',
    category: 'insight',
  },
  {
    id: 'model-explanation',
    label: 'モデル解説',
    icon: <Sparkles className="h-4 w-4" />,
    prompt: 'このモデルについて、ビジネス担当者にもわかるように解説してください。何を学習したのか、どのような予測ができるのか、注意点は何かを教えてください。',
    category: 'insight',
  },
  // アクション
  {
    id: 'available-insights',
    label: 'インサイト一覧',
    icon: <Info className="h-4 w-4" />,
    prompt: 'このモデルで利用可能なインサイト機能を教えてください。Feature Impact、ROC曲線、リフトチャート、SHAP等、何が確認できますか？',
    category: 'action',
  },
  {
    id: 'deploy',
    label: 'デプロイ',
    icon: <Rocket className="h-4 w-4" />,
    prompt: 'このモデルをデプロイする方法を教えてください。必要な手順と注意点を説明してください。',
    category: 'action',
  },
  {
    id: 'help',
    label: 'ヘルプ',
    icon: <HelpCircle className="h-4 w-4" />,
    prompt: 'DataRobotエージェントで何ができるか教えてください。プロジェクト管理、モデル分析、インサイト機能、予測実行など、利用可能な機能を簡潔に説明してください。',
    category: 'action',
  },
];

export function QuickActions({
  hasProject = false,
  hasModel = false,
  currentProjectId,
  currentModelId,
  onAction,
  isRunning = false,
  customActions,
  className,
}: QuickActionsProps) {
  const actions = customActions || defaultActions;

  // アクションの有効/無効を判定
  const getActionState = (actionId: string): boolean => {
    switch (actionId) {
      // 常に有効
      case 'list-projects':
      case 'help':
        return false;
      // プロジェクト選択が必要
      case 'model-comparison':
        return !hasProject;
      // モデル選択が必要
      case 'feature-impact':
      case 'roc-curve':
      case 'lift-chart':
      case 'model-explanation':
      case 'available-insights':
      case 'deploy':
        return !hasModel;
      default:
        return false;
    }
  };
  
  // プロンプトにコンテキスト情報を追加
  const getPromptWithContext = (action: QuickAction): string => {
    return buildPromptWithContext(
      action.prompt,
      hasProject ? currentProjectId : undefined,
      hasModel ? currentModelId : undefined
    );
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
              onClick={() => onAction(getPromptWithContext(action))}
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
