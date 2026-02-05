/**
 * Model Comparison Table Component
 *
 * 複数のDataRobotモデルを比較表示するテーブルコンポーネント。
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Award } from 'lucide-react';

export interface ModelComparisonData {
  modelId: string;
  modelName: string;
  modelType: string;
  metrics: Record<string, number>;
  isRecommended?: boolean;
}

export interface ModelComparisonTableProps {
  models: ModelComparisonData[];
  primaryMetric?: string;
  className?: string;
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Trophy className="w-5 h-5 text-yellow-400" />;
    case 2:
      return <Medal className="w-5 h-5 text-gray-300" />;
    case 3:
      return <Award className="w-5 h-5 text-amber-600" />;
    default:
      return <span className="text-gray-500 font-mono text-sm">{rank}</span>;
  }
}

function getMetricCellColor(value: number, isHighest: boolean): string {
  if (isHighest) return 'text-[#81FBA5] font-bold';
  if (value >= 0.9) return 'text-green-400';
  if (value >= 0.7) return 'text-gray-200';
  if (value >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

export function ModelComparisonTable({
  models,
  primaryMetric = 'AUC',
  className,
}: ModelComparisonTableProps) {
  // メトリクス名一覧を取得
  const metricNames = useMemo(() => {
    const names = new Set<string>();
    models.forEach(m => {
      Object.keys(m.metrics).forEach(name => names.add(name));
    });
    return Array.from(names);
  }, [models]);

  // 各メトリクスの最大値を計算
  const maxValues = useMemo(() => {
    const max: Record<string, number> = {};
    metricNames.forEach(name => {
      max[name] = Math.max(...models.map(m => m.metrics[name] || 0));
    });
    return max;
  }, [models, metricNames]);

  // プライマリメトリクスでソート
  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const aVal = a.metrics[primaryMetric] || 0;
      const bVal = b.metrics[primaryMetric] || 0;
      return bVal - aVal;
    });
  }, [models, primaryMetric]);

  if (models.length === 0) {
    return (
      <Card className={cn('bg-gray-800 border-gray-700', className)}>
        <CardHeader>
          <CardTitle className="text-white text-lg">モデル比較</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400">比較するモデルがありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('bg-gray-800 border-gray-700', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <div className="w-1 h-6 bg-[#81FBA5]" />
          モデル比較
          <Badge variant="secondary" className="bg-gray-700 text-gray-200 ml-2">
            {models.length} モデル
          </Badge>
        </CardTitle>
        <p className="text-xs text-gray-400 mt-1">
          ランキング基準: {primaryMetric}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-2 text-gray-400 font-medium w-12">順位</th>
                <th className="text-left py-3 px-2 text-gray-400 font-medium">モデル名</th>
                <th className="text-left py-3 px-2 text-gray-400 font-medium">タイプ</th>
                {metricNames.map(name => (
                  <th
                    key={name}
                    className={cn(
                      'text-right py-3 px-2 font-medium',
                      name === primaryMetric ? 'text-[#81FBA5]' : 'text-gray-400'
                    )}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((model, index) => (
                <tr
                  key={model.modelId}
                  className={cn(
                    'border-b border-gray-700/50 transition-colors',
                    model.isRecommended
                      ? 'bg-[#81FBA5]/10 hover:bg-[#81FBA5]/20'
                      : 'hover:bg-gray-700/30'
                  )}
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center justify-center">
                      {getRankIcon(index + 1)}
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate max-w-[200px]" title={model.modelName}>
                        {model.modelName}
                      </span>
                      {model.isRecommended && (
                        <Badge className="bg-[#81FBA5]/20 text-[#81FBA5] border-[#81FBA5]/50 text-xs">
                          推奨
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-gray-300 text-xs">
                    {model.modelType}
                  </td>
                  {metricNames.map(name => {
                    const value = model.metrics[name];
                    const isHighest = value === maxValues[name];
                    return (
                      <td
                        key={name}
                        className={cn(
                          'py-3 px-2 text-right font-mono',
                          getMetricCellColor(value || 0, isHighest)
                        )}
                      >
                        {value !== undefined ? (value * 100).toFixed(2) + '%' : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default ModelComparisonTable;
