/**
 * Lift Chart Component
 *
 * モデルのリフトチャートを表示するコンポーネント
 */
import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface LiftChartDataPoint {
  percentile: number;
  lift: number;
  cumulativeCapture?: number;
}

export interface LiftChartProps {
  data: LiftChartDataPoint[];
  modelName?: string;
  projectName?: string;
}

export function LiftChart({ data, modelName, projectName }: LiftChartProps) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.percentile - b.percentile);
  }, [data]);

  // 最大リフト値を計算（スケール用）
  const maxLift = useMemo(() => {
    return Math.max(...data.map((d) => d.lift), 1);
  }, [data]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* ヘッダー */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#81FBA5]">📊</span>
          リフトチャート
        </h3>
        {(modelName || projectName) && (
          <p className="text-sm text-gray-600 mt-1">
            {modelName && <span className="font-medium">{modelName}</span>}
            {modelName && projectName && ' - '}
            {projectName && <span>{projectName}</span>}
          </p>
        )}
      </div>

      {/* サマリー */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {sortedData.length > 0 && (
          <>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">上位10%のリフト</p>
              <p className="text-xl font-bold text-[#81FBA5]">
                {sortedData.find((d) => d.percentile === 10)?.lift.toFixed(2) || '-'}x
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">上位10%でのカバー率</p>
              <p className="text-xl font-bold text-blue-600">
                {sortedData.find((d) => d.percentile === 10)?.cumulativeCapture
                  ? `${(sortedData.find((d) => d.percentile === 10)!.cumulativeCapture! * 100).toFixed(0)}%`
                  : '-'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* チャート */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sortedData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="percentile"
              tickFormatter={(v) => `${v}%`}
              label={{ value: '予測スコア上位 (%)', position: 'bottom', offset: 0 }}
            />
            <YAxis
              yAxisId="left"
              domain={[0, Math.ceil(maxLift)]}
              label={{ value: 'リフト', angle: -90, position: 'insideLeft' }}
            />
            {data.some((d) => d.cumulativeCapture !== undefined) && (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                label={{ value: '累積カバー率', angle: 90, position: 'insideRight' }}
              />
            )}
            <Tooltip
              formatter={(value: number, name: string) => [
                name === 'lift' ? `${value.toFixed(2)}x` : `${(value * 100).toFixed(1)}%`,
                name === 'lift' ? 'リフト' : '累積カバー率',
              ]}
              labelFormatter={(label) => `上位 ${label}%`}
              contentStyle={{ backgroundColor: 'white', borderRadius: '8px' }}
            />
            <Legend />
            {/* ベースライン（リフト=1） */}
            <ReferenceLine yAxisId="left" y={1} stroke="#999" strokeDasharray="3 3" />
            {/* リフト棒グラフ */}
            <Bar
              yAxisId="left"
              dataKey="lift"
              fill="#81FBA5"
              name="リフト"
              radius={[4, 4, 0, 0]}
            />
            {/* 累積カバー率ライン */}
            {data.some((d) => d.cumulativeCapture !== undefined) && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulativeCapture"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#3B82F6' }}
                name="累積カバー率"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 解説 */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• <strong>リフト</strong>: ランダム選択と比較した、モデルの効率性（リフト2 = 2倍効率的）</p>
        <p>• <strong>累積カバー率</strong>: 上位X%の予測でターゲット全体の何%をカバーするか</p>
        <p>• マーケティング施策などで、対象顧客の絞り込み効果を評価できます</p>
      </div>
    </div>
  );
}

export default LiftChart;
