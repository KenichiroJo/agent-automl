/**
 * Residuals Chart Component
 *
 * 回帰モデルの残差分析を表示するコンポーネント
 */
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
} from 'recharts';

export interface ResidualPoint {
  actual: number;
  predicted: number;
  residual: number;
}

export interface ResidualsChartProps {
  residuals: ResidualPoint[];
  modelName?: string;
  projectName?: string;
}

export function ResidualsChart({
  residuals,
  modelName,
  projectName,
}: ResidualsChartProps) {
  // 残差の統計量を計算
  const residualValues = residuals.map(r => r.residual);
  const meanResidual = residualValues.reduce((a, b) => a + b, 0) / residualValues.length;
  const mse = residualValues.reduce((a, b) => a + b * b, 0) / residualValues.length;
  const rmse = Math.sqrt(mse);
  const mae = residualValues.reduce((a, b) => a + Math.abs(b), 0) / residualValues.length;

  // 実測値の範囲
  const actualValues = residuals.map(r => r.actual);
  const minActual = Math.min(...actualValues);
  const maxActual = Math.max(...actualValues);
  const range = maxActual - minActual;

  // R² の近似計算
  const meanActual = actualValues.reduce((a, b) => a + b, 0) / actualValues.length;
  const ssTot = actualValues.reduce((a, b) => a + Math.pow(b - meanActual, 2), 0);
  const ssRes = residualValues.reduce((a, b) => a + b * b, 0);
  const rSquared = 1 - ssRes / ssTot;

  // ヒストグラム用のビン分割
  const numBins = 20;
  const minResidual = Math.min(...residualValues);
  const maxResidual = Math.max(...residualValues);
  const binWidth = (maxResidual - minResidual) / numBins || 1;
  const histogramData = Array.from({ length: numBins }, (_, i) => {
    const binStart = minResidual + i * binWidth;
    const binEnd = binStart + binWidth;
    const count = residualValues.filter(r => r >= binStart && r < binEnd).length;
    return {
      bin: ((binStart + binEnd) / 2).toFixed(2),
      count,
    };
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* ヘッダー */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#81FBA5]">📈</span>
          残差分析 (Residual Analysis)
        </h3>
        {(modelName || projectName) && (
          <p className="text-sm text-gray-600 mt-1">
            {modelName && <span className="font-medium">{modelName}</span>}
            {modelName && projectName && ' - '}
            {projectName && <span>{projectName}</span>}
          </p>
        )}
      </div>

      {/* 統計量サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">RMSE</p>
          <p className="text-xl font-bold text-[#81FBA5]">{rmse.toFixed(3)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">MAE</p>
          <p className="text-xl font-bold text-blue-600">{mae.toFixed(3)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">R²</p>
          <p className="text-xl font-bold text-purple-600">{(rSquared * 100).toFixed(1)}%</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">残差の平均</p>
          <p className="text-xl font-bold text-gray-600">{meanResidual.toFixed(4)}</p>
        </div>
      </div>

      {/* チャートエリア */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 予測 vs 実測 散布図 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">予測 vs 実測</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  type="number"
                  dataKey="actual"
                  name="実測値"
                  domain={['auto', 'auto']}
                  label={{ value: '実測値', position: 'bottom', offset: 0 }}
                />
                <YAxis
                  type="number"
                  dataKey="predicted"
                  name="予測値"
                  domain={['auto', 'auto']}
                  label={{ value: '予測値', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(value: number) => value.toFixed(3)}
                />
                {/* 理想的な予測線 (y = x) */}
                <ReferenceLine
                  segment={[
                    { x: minActual - range * 0.1, y: minActual - range * 0.1 },
                    { x: maxActual + range * 0.1, y: maxActual + range * 0.1 },
                  ]}
                  stroke="#81FBA5"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                />
                <Scatter
                  data={residuals}
                  fill="#6366F1"
                  fillOpacity={0.6}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            緑の点線は理想的な予測 (y = x)
          </p>
        </div>

        {/* 残差ヒストグラム */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">残差分布</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="bin"
                  label={{ value: '残差', position: 'bottom', offset: 0 }}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  label={{ value: '頻度', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip />
                <ReferenceLine x={0} stroke="#81FBA5" strokeWidth={2} />
                <Bar dataKey="count" fill="#6366F1" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            残差が0を中心に正規分布に近いほど良いモデル
          </p>
        </div>
      </div>

      {/* 解説 */}
      <div className="mt-4 text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
        <p>• <strong>RMSE</strong>: 予測誤差の二乗平均平方根（小さいほど良い）</p>
        <p>• <strong>MAE</strong>: 予測誤差の絶対値の平均（外れ値に頑健）</p>
        <p>• <strong>R²</strong>: 決定係数（1に近いほど説明力が高い）</p>
        <p>• 残差が0周辺に均等に分布し、パターンがないことが理想的</p>
      </div>
    </div>
  );
}

export default ResidualsChart;
