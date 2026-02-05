/**
 * Feature Effects Chart Component
 *
 * 特徴量ごとの作用（部分依存）を表示するコンポーネント
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface FeatureEffectDataPoint {
  value: number | string;
  effect: number;
}

export interface FeatureEffectsChartProps {
  data: FeatureEffectDataPoint[];
  featureName: string;
  modelName?: string;
  projectName?: string;
}

export function FeatureEffectsChart({
  data,
  featureName,
  modelName,
  projectName,
}: FeatureEffectsChartProps) {
  // 効果の範囲を計算
  const minEffect = Math.min(...data.map((d) => d.effect));
  const maxEffect = Math.max(...data.map((d) => d.effect));
  const effectRange = maxEffect - minEffect;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* ヘッダー */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#81FBA5]">📈</span>
          特徴量ごとの作用
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          <span className="font-medium text-blue-600">{featureName}</span>
          {modelName && ` - ${modelName}`}
        </p>
        {projectName && (
          <p className="text-xs text-gray-500">{projectName}</p>
        )}
      </div>

      {/* 効果の範囲サマリー */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">予測への影響範囲</span>
          <span className="font-medium">
            {minEffect.toFixed(3)} 〜 {maxEffect.toFixed(3)}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          この特徴量の値が変化すると、予測値が約 {effectRange.toFixed(3)} の範囲で変動します
        </p>
      </div>

      {/* チャート */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="value"
              label={{ value: featureName, position: 'bottom', offset: 0 }}
              tickFormatter={(v) => typeof v === 'number' ? v.toLocaleString() : v}
            />
            <YAxis
              domain={[minEffect - effectRange * 0.1, maxEffect + effectRange * 0.1]}
              tickFormatter={(v) => v.toFixed(2)}
              label={{ value: '予測への影響', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={(value: number) => [value.toFixed(4), '予測への影響']}
              labelFormatter={(label) => `${featureName}: ${typeof label === 'number' ? label.toLocaleString() : label}`}
              contentStyle={{ backgroundColor: 'white', borderRadius: '8px' }}
            />
            {/* ゼロライン */}
            <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
            {/* 効果ライン */}
            <Line
              type="monotone"
              dataKey="effect"
              stroke="#81FBA5"
              strokeWidth={2}
              dot={{ r: 4, fill: '#81FBA5' }}
              activeDot={{ r: 6, fill: '#81FBA5' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 解説 */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• このグラフは、他の特徴量を固定した状態での「部分依存」を示します</p>
        <p>• <strong>プラスの効果</strong>: 予測値を上げる方向に作用</p>
        <p>• <strong>マイナスの効果</strong>: 予測値を下げる方向に作用</p>
        <p>• 曲線の傾きが急な部分は、その値の変化が予測に大きく影響します</p>
      </div>
    </div>
  );
}

export default FeatureEffectsChart;
