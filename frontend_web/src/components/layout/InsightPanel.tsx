/**
 * Insight Panel - 右カラム
 *
 * 会話から抽出されたインサイトを常時表示するパネル
 * インサイトはスタック形式で追加され、ピン留め・削除が可能
 */
import { useState } from 'react';
import {
  Pin,
  PinOff,
  X,
  Plus,
  Download,
  RefreshCw,
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  Grid3X3,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InsightRenderer, type InsightData } from '@/components/insights';

export interface InsightItem {
  id: string;
  data: InsightData;
  isPinned?: boolean;
  createdAt?: Date;
}

export interface InsightPanelProps {
  /** 表示するインサイトのリスト */
  insights: InsightItem[];
  /** インサイトをピン留め/解除 */
  onTogglePin?: (id: string) => void;
  /** インサイトを削除 */
  onRemove?: (id: string) => void;
  /** インサイトを更新（再取得） */
  onRefresh?: (id: string) => void;
  /** インサイトをエクスポート */
  onExport?: (id: string) => void;
  /** 新しいインサイトを追加 */
  onAddInsight?: () => void;
}

const getInsightIcon = (type: string) => {
  switch (type) {
    case 'feature_impact':
      return <BarChart3 className="h-4 w-4" />;
    case 'roc_curve':
    case 'lift_chart':
    case 'feature_effects':
      return <LineChart className="h-4 w-4" />;
    case 'confusion_matrix':
      return <Grid3X3 className="h-4 w-4" />;
    case 'time_series_forecast':
      return <TrendingUp className="h-4 w-4" />;
    case 'prediction_explanation':
      return <Sparkles className="h-4 w-4" />;
    default:
      return <PieChart className="h-4 w-4" />;
  }
};

const getInsightTitle = (data: InsightData): string => {
  switch (data.type) {
    case 'feature_impact':
      return 'Feature Impact';
    case 'model_metrics':
      return 'Model Metrics';
    case 'project_list':
      return 'Projects';
    case 'model_comparison':
      return 'Model Comparison';
    case 'roc_curve':
      return 'ROC Curve';
    case 'lift_chart':
      return 'Lift Chart';
    case 'feature_effects':
      return 'Feature Effects';
    case 'prediction_explanation':
      return 'Prediction Explanation';
    case 'confusion_matrix':
      return 'Confusion Matrix';
    case 'residuals':
      return 'Residuals';
    default:
      return 'Insight';
  }
};

export function InsightPanel({
  insights,
  onTogglePin,
  onRemove,
  onRefresh,
  onExport,
  onAddInsight,
}: InsightPanelProps) {
  // ピン留めされたものを先に表示
  const sortedInsights = [...insights].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 bg-[#81FBA5] rounded-full" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Insights
          </h2>
          <Badge variant="secondary" className="text-xs">
            {insights.length}
          </Badge>
        </div>
        {onAddInsight && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddInsight}
                  className="h-8 w-8 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>インサイトを追加</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* インサイトリスト */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {sortedInsights.length > 0 ? (
            sortedInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onTogglePin={onTogglePin}
                onRemove={onRemove}
                onRefresh={onRefresh}
                onExport={onExport}
              />
            ))
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                インサイトがありません
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                会話でデータを分析すると
                <br />
                ここにチャートが表示されます
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface InsightCardProps {
  insight: InsightItem;
  onTogglePin?: (id: string) => void;
  onRemove?: (id: string) => void;
  onRefresh?: (id: string) => void;
  onExport?: (id: string) => void;
}

function InsightCard({
  insight,
  onTogglePin,
  onRemove,
  onRefresh,
  onExport,
}: InsightCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-200',
        insight.isPinned
          ? 'border-[#81FBA5]/50 bg-[#81FBA5]/5'
          : 'border-border bg-card hover:border-muted-foreground/30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* カードヘッダー */}
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-[#81FBA5]">
            {getInsightIcon(insight.data.type)}
          </span>
          <span className="text-sm font-medium text-foreground">
            {getInsightTitle(insight.data)}
          </span>
          {insight.isPinned && (
            <Pin className="h-3 w-3 text-[#81FBA5]" />
          )}
        </div>

        {/* アクションボタン */}
        <div
          className={cn(
            'flex items-center gap-1 transition-opacity',
            isHovered ? 'opacity-100' : 'opacity-0'
          )}
        >
          <TooltipProvider>
            {onTogglePin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTogglePin(insight.id)}
                    className="h-6 w-6 p-0"
                  >
                    {insight.isPinned ? (
                      <PinOff className="h-3 w-3" />
                    ) : (
                      <Pin className="h-3 w-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{insight.isPinned ? 'ピン解除' : 'ピン留め'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onRefresh && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRefresh(insight.id)}
                    className="h-6 w-6 p-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>更新</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onExport && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExport(insight.id)}
                    className="h-6 w-6 p-0"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>エクスポート</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onRemove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(insight.id)}
                    className="h-6 w-6 p-0 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>削除</p>
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* インサイトコンテンツ */}
      <div className="p-2">
        <InsightRenderer insight={insight.data} />
      </div>
    </div>
  );
}

export default InsightPanel;
