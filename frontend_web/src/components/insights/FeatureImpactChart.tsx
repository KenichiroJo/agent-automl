/**
 * Feature Impact Chart Component
 *
 * DataRobotのFeature Impact（特徴量重要度）を可視化するコンポーネント。
 * エージェントからのJSON出力をパースして横棒グラフで表示します。
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface FeatureImpactData {
  feature: string;
  impact: number;
  normalizedImpact?: number;
}

export interface FeatureImpactChartProps {
  data: FeatureImpactData[];
  title?: string;
  maxFeatures?: number;
  className?: string;
}

export function FeatureImpactChart({
  data,
  title = '特徴量重要度 (Feature Impact)',
  maxFeatures = 10,
  className,
}: FeatureImpactChartProps) {
  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.impact - a.impact);
    const top = sorted.slice(0, maxFeatures);

    // 正規化（最大値を100%として）
    const maxImpact = Math.max(...top.map(d => d.impact));
    return top.map(d => ({
      ...d,
      normalizedImpact: maxImpact > 0 ? (d.impact / maxImpact) * 100 : 0,
    }));
  }, [data, maxFeatures]);

  if (!data || data.length === 0) {
    return (
      <Card className={cn('bg-gray-800 border-gray-700', className)}>
        <CardHeader>
          <CardTitle className="text-white text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400">データがありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('bg-gray-800 border-gray-700', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <div className="w-1 h-6 bg-[#81FBA5]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedData.map((item, index) => (
          <div key={item.feature} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-200 truncate max-w-[60%]" title={item.feature}>
                {index + 1}. {item.feature}
              </span>
              <span className="text-sm font-mono text-[#81FBA5]">
                {(item.impact * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#81FBA5] to-[#4ade80] rounded-full transition-all duration-500"
                style={{ width: `${item.normalizedImpact}%` }}
              />
            </div>
          </div>
        ))}
        {data.length > maxFeatures && (
          <p className="text-xs text-gray-500 mt-2">
            他 {data.length - maxFeatures} 件の特徴量
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default FeatureImpactChart;
