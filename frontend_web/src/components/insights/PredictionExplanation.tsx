/**
 * Prediction Explanation Component (SHAP)
 *
 * 個々の予測に対するSHAP値の説明を表示するコンポーネント
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

export interface ShapExplanation {
  feature: string;
  value: number | string;
  shap: number;
  direction: 'positive' | 'negative';
}

export interface PredictionExplanationProps {
  explanations: ShapExplanation[];
  prediction?: number;
  baseValue?: number;
  modelName?: string;
  projectName?: string;
}

export function PredictionExplanation({
  explanations,
  prediction,
  baseValue,
  modelName,
  projectName,
}: PredictionExplanationProps) {
  // SHAPの絶対値でソート
  const sortedExplanations = [...explanations].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* ヘッダー */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#81FBA5]">🔍</span>
          予測の説明 (SHAP)
        </h3>
        {(modelName || projectName) && (
          <p className="text-sm text-gray-600 mt-1">
            {modelName && <span className="font-medium">{modelName}</span>}
            {modelName && projectName && ' - '}
            {projectName && <span>{projectName}</span>}
          </p>
        )}
      </div>

      {/* 予測値サマリー */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {prediction !== undefined && (
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500">予測値</p>
            <p className="text-2xl font-bold text-[#81FBA5]">{prediction.toFixed(3)}</p>
          </div>
        )}
        {baseValue !== undefined && (
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500">ベース値（平均）</p>
            <p className="text-2xl font-bold text-gray-600">{baseValue.toFixed(3)}</p>
          </div>
        )}
      </div>

      {/* 寄与度チャート */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sortedExplanations}
            layout="vertical"
            margin={{ top: 20, right: 30, left: 120, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" horizontal={false} />
            <XAxis
              type="number"
              domain={['auto', 'auto']}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <YAxis
              type="category"
              dataKey="feature"
              width={110}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number, _name: string, props: { payload: ShapExplanation }) => {
                const explanation = props.payload;
                return [
                  <>
                    <div>SHAP: {value.toFixed(4)}</div>
                    <div>値: {explanation.value}</div>
                  </>,
                  explanation.feature,
                ];
              }}
              contentStyle={{ backgroundColor: 'white', borderRadius: '8px' }}
            />
            <ReferenceLine x={0} stroke="#999" />
            <Bar dataKey="shap" radius={[0, 4, 4, 0]}>
              {sortedExplanations.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.shap >= 0 ? '#81FBA5' : '#F87171'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 詳細テーブル */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-gray-600">特徴量</th>
              <th className="text-left py-2 px-3 text-gray-600">値</th>
              <th className="text-right py-2 px-3 text-gray-600">SHAP寄与</th>
              <th className="text-center py-2 px-3 text-gray-600">影響</th>
            </tr>
          </thead>
          <tbody>
            {sortedExplanations.slice(0, 10).map((exp, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{exp.feature}</td>
                <td className="py-2 px-3 text-gray-600">
                  {typeof exp.value === 'number' ? exp.value.toLocaleString() : exp.value}
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  <span className={exp.shap >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {exp.shap >= 0 ? '+' : ''}{exp.shap.toFixed(4)}
                  </span>
                </td>
                <td className="py-2 px-3 text-center">
                  {exp.shap >= 0 ? (
                    <span className="text-green-600">↑ 上昇</span>
                  ) : (
                    <span className="text-red-600">↓ 下降</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 解説 */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• <strong>SHAP値</strong>: 各特徴量がこの予測にどれだけ寄与したかを示します</p>
        <p>• <span className="text-green-600">緑（プラス）</span>: 予測値を上げる方向に寄与</p>
        <p>• <span className="text-red-600">赤（マイナス）</span>: 予測値を下げる方向に寄与</p>
      </div>
    </div>
  );
}

export default PredictionExplanation;
