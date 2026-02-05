/**
 * Time Series Forecast Chart Component
 *
 * 時系列予測を表示するコンポーネント
 * - 実績値（過去データ）と予測値（将来）を表示
 * - 信頼区間の帯を表示
 * - 期間選択、ズーム機能
 */
import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Calendar, TrendingUp, TrendingDown, Minus, Download, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TimeSeriesDataPoint {
  timestamp: string;
  actual?: number;
  predicted: number;
  lowerBound?: number;
  upperBound?: number;
}

export interface TimeSeriesForecastChartProps {
  data: TimeSeriesDataPoint[];
  modelName?: string;
  projectName?: string;
  /** 予測開始日のインデックスまたは日付 */
  forecastStartIndex?: number;
  /** Y軸のラベル */
  yAxisLabel?: string;
  /** 数値フォーマット関数 */
  formatValue?: (value: number) => string;
}

type PeriodOption = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

export function TimeSeriesForecastChart({
  data,
  modelName,
  projectName,
  forecastStartIndex,
  yAxisLabel = '値',
  formatValue = (v) => v.toLocaleString(),
}: TimeSeriesForecastChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('ALL');

  // 予測開始インデックスを自動検出（actualがundefinedになる最初の点）
  const actualForecastStartIndex = useMemo(() => {
    if (forecastStartIndex !== undefined) return forecastStartIndex;
    const idx = data.findIndex((d) => d.actual === undefined);
    return idx === -1 ? data.length : idx;
  }, [data, forecastStartIndex]);

  // 期間でフィルタリング
  const filteredData = useMemo(() => {
    if (selectedPeriod === 'ALL') return data;

    const periodDays: Record<PeriodOption, number> = {
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      'ALL': Infinity,
    };

    const days = periodDays[selectedPeriod];
    const endIndex = Math.min(actualForecastStartIndex + days, data.length);
    const startIndex = Math.max(0, actualForecastStartIndex - days);
    return data.slice(startIndex, endIndex);
  }, [data, selectedPeriod, actualForecastStartIndex]);

  // サマリー統計を計算
  const summary = useMemo(() => {
    const forecastData = data.slice(actualForecastStartIndex);
    if (forecastData.length === 0) return null;

    const nextPrediction = forecastData[0];
    const lastActual = data[actualForecastStartIndex - 1]?.actual;
    const avgPredicted = forecastData.reduce((sum, d) => sum + d.predicted, 0) / forecastData.length;

    let trend: 'up' | 'down' | 'flat' = 'flat';
    let trendPercent = 0;
    if (lastActual && nextPrediction) {
      trendPercent = ((nextPrediction.predicted - lastActual) / lastActual) * 100;
      if (trendPercent > 1) trend = 'up';
      else if (trendPercent < -1) trend = 'down';
    }

    return {
      nextPrediction: nextPrediction?.predicted,
      nextLower: nextPrediction?.lowerBound,
      nextUpper: nextPrediction?.upperBound,
      avgPredicted,
      trend,
      trendPercent,
      forecastPeriod: forecastData.length,
    };
  }, [data, actualForecastStartIndex]);

  // 予測開始日のタイムスタンプ
  const forecastStartTimestamp = data[actualForecastStartIndex]?.timestamp;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* ヘッダー */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#81FBA5]">📈</span>
          時系列予測 (Time Series Forecast)
        </h3>
        {(modelName || projectName) && (
          <p className="text-sm text-gray-600 mt-1">
            {modelName && <span className="font-medium">{modelName}</span>}
            {modelName && projectName && ' - '}
            {projectName && <span>{projectName}</span>}
          </p>
        )}
      </div>

      {/* サマリーカード */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500">次期予測</p>
            <p className="text-xl font-bold text-[#81FBA5]">
              {formatValue(summary.nextPrediction || 0)}
            </p>
            {summary.nextLower !== undefined && summary.nextUpper !== undefined && (
              <p className="text-xs text-gray-400">
                CI: {formatValue(summary.nextLower)} - {formatValue(summary.nextUpper)}
              </p>
            )}
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500">トレンド</p>
            <div className="flex items-center gap-1">
              {summary.trend === 'up' && (
                <>
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <span className="text-xl font-bold text-green-500">
                    +{summary.trendPercent.toFixed(1)}%
                  </span>
                </>
              )}
              {summary.trend === 'down' && (
                <>
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  <span className="text-xl font-bold text-red-500">
                    {summary.trendPercent.toFixed(1)}%
                  </span>
                </>
              )}
              {summary.trend === 'flat' && (
                <>
                  <Minus className="h-5 w-5 text-gray-500" />
                  <span className="text-xl font-bold text-gray-500">横ばい</span>
                </>
              )}
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500">予測期間</p>
            <p className="text-xl font-bold text-gray-700">
              {summary.forecastPeriod}期間
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500">予測平均</p>
            <p className="text-xl font-bold text-blue-600">
              {formatValue(summary.avgPredicted)}
            </p>
          </div>
        </div>
      )}

      {/* チャート */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filteredData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => {
                // 日付を短縮表示
                const date = new Date(value);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => formatValue(value)}
              label={{
                value: yAxisLabel,
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fontSize: 12 },
              }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatValue(value),
                name === 'actual'
                  ? '実績'
                  : name === 'predicted'
                  ? '予測'
                  : name === 'upperBound'
                  ? '上限'
                  : '下限',
              ]}
              labelFormatter={(label) => `日付: ${label}`}
              contentStyle={{ backgroundColor: 'white', borderRadius: '8px' }}
            />
            <Legend
              formatter={(value) =>
                value === 'actual'
                  ? '実績'
                  : value === 'predicted'
                  ? '予測'
                  : value === 'confidenceInterval'
                  ? '信頼区間'
                  : value
              }
            />

            {/* 信頼区間の帯 */}
            <Area
              type="monotone"
              dataKey="upperBound"
              stroke="none"
              fill="#81FBA5"
              fillOpacity={0.1}
              name="confidenceInterval"
            />
            <Area
              type="monotone"
              dataKey="lowerBound"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
            />

            {/* 予測開始の垂直線 */}
            {forecastStartTimestamp && (
              <ReferenceLine
                x={forecastStartTimestamp}
                stroke="#6366F1"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: '予測開始',
                  position: 'top',
                  fill: '#6366F1',
                  fontSize: 11,
                }}
              />
            )}

            {/* 実績ライン */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#374151"
              strokeWidth={2}
              dot={{ fill: '#374151', r: 3 }}
              activeDot={{ r: 5 }}
              name="actual"
              connectNulls={false}
            />

            {/* 予測ライン */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#81FBA5"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: '#81FBA5', r: 3 }}
              activeDot={{ r: 5 }}
              name="predicted"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 期間選択 & アクション */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
        <div className="flex gap-1">
          {(['1W', '1M', '3M', '6M', '1Y', 'ALL'] as PeriodOption[]).map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
              className={cn(
                'text-xs h-7 px-2',
                selectedPeriod === period && 'bg-[#81FBA5] text-gray-900 hover:bg-[#6de090]'
              )}
            >
              {period}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </div>

      {/* 凡例 */}
      <div className="mt-3 text-xs text-gray-500 space-y-1">
        <p>• <strong className="text-gray-700">実線</strong>: 実績データ（過去）</p>
        <p>• <strong className="text-[#81FBA5]">破線</strong>: 予測データ（将来）</p>
        <p>• <strong className="text-[#81FBA5]/30">薄緑の帯</strong>: 信頼区間（95%）</p>
      </div>
    </div>
  );
}

export default TimeSeriesForecastChart;
