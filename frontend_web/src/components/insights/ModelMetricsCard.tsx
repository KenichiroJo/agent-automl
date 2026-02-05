/**
 * Model Metrics Card Component
 *
 * DataRobotモデルの精度指標を表示するカードコンポーネント。
 * AUC、Accuracy、F1スコアなどの主要メトリクスを表示します。
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface ModelMetric {
  name: string;
  value: number;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ModelMetricsCardProps {
  modelName: string;
  modelType?: string;
  metrics: ModelMetric[];
  projectName?: string;
  className?: string;
}

function getMetricColor(value: number): string {
  if (value >= 0.9) return 'text-green-400';
  if (value >= 0.7) return 'text-[#81FBA5]';
  if (value >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

function TrendIcon({ trend }: { trend?: 'up' | 'down' | 'neutral' }) {
  if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-400" />;
  if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-gray-500" />;
}

export function ModelMetricsCard({
  modelName,
  modelType,
  metrics,
  projectName,
  className,
}: ModelMetricsCardProps) {
  return (
    <Card className={cn('bg-gray-800 border-gray-700', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-[#81FBA5]" />
            <div>
              <CardTitle className="text-white text-lg">{modelName}</CardTitle>
              {projectName && (
                <p className="text-xs text-gray-400 mt-1">Project: {projectName}</p>
              )}
            </div>
          </div>
          {modelType && (
            <Badge variant="secondary" className="bg-gray-700 text-gray-200">
              {modelType}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {metrics.map(metric => (
            <div
              key={metric.name}
              className="bg-gray-900 rounded-lg p-3 border border-gray-700"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {metric.name}
                </span>
                <TrendIcon trend={metric.trend} />
              </div>
              <div className={cn('text-2xl font-bold', getMetricColor(metric.value))}>
                {(metric.value * 100).toFixed(2)}%
              </div>
              {metric.description && (
                <p className="text-xs text-gray-500 mt-1">{metric.description}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default ModelMetricsCard;
