/**
 * ROC Curve Chart Component
 *
 * 分類モデルのROC曲線を表示するコンポーネント
 */
import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface RocCurveDataPoint {
  threshold: number;
  fpr: number;  // False Positive Rate
  tpr: number;  // True Positive Rate
}

export interface RocCurveChartProps {
  data: RocCurveDataPoint[];
  auc?: number;
  modelName?: string;
  projectName?: string;
}

export function RocCurveChart({ data, auc, modelName, projectName }: RocCurveChartProps) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.fpr - b.fpr);
  }, [data]);

  // ランダム分類器の対角線用データ
  const diagonalData = [
    { fpr: 0, tpr: 0 },
    { fpr: 1, tpr: 1 },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* ヘッダー */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#81FBA5]">📈</span>
          ROC曲線
        </h3>
        {(modelName || projectName) && (
          <p className="text-sm text-gray-600 mt-1">
            {modelName && <span className="font-medium">{modelName}</span>}
            {modelName && projectName && ' - '}
            {projectName && <span>{projectName}</span>}
          </p>
        )}
      </div>

      {/* AUC表示 */}
      {auc !== undefined && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">AUC (曲線下面積)</span>
            <span className="text-2xl font-bold text-[#81FBA5]">{auc.toFixed(3)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {auc >= 0.9 ? '優秀: 非常に高い判別力' :
             auc >= 0.8 ? '良好: 高い判別力' :
             auc >= 0.7 ? '普通: まずまずの判別力' :
             auc >= 0.6 ? '改善余地あり: 判別力が低い' :
             '要注意: ランダムに近い'}
          </p>
        </div>
      )}

      {/* チャート */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              type="number"
              dataKey="fpr"
              domain={[0, 1]}
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: '偽陽性率 (FPR)', position: 'bottom', offset: 0 }}
            />
            <YAxis
              type="number"
              dataKey="tpr"
              domain={[0, 1]}
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: '真陽性率 (TPR)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                value.toFixed(3),
                name === 'tpr' ? '真陽性率' : '偽陽性率',
              ]}
              labelFormatter={(label) => `FPR: ${Number(label).toFixed(3)}`}
              contentStyle={{ backgroundColor: 'white', borderRadius: '8px' }}
            />
            <Legend />
            {/* ランダム分類器の対角線 */}
            <Line
              data={diagonalData}
              type="linear"
              dataKey="tpr"
              stroke="#ccc"
              strokeDasharray="5 5"
              dot={false}
              name="ランダム"
            />
            {/* ROC曲線 */}
            <Line
              data={sortedData}
              type="monotone"
              dataKey="tpr"
              stroke="#81FBA5"
              strokeWidth={2}
              dot={{ r: 3, fill: '#81FBA5' }}
              activeDot={{ r: 5, fill: '#81FBA5' }}
              name="モデル"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 解説 */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• <strong>真陽性率 (TPR)</strong>: 実際に陽性のケースを正しく陽性と予測した割合</p>
        <p>• <strong>偽陽性率 (FPR)</strong>: 実際に陰性のケースを誤って陽性と予測した割合</p>
        <p>• 曲線が左上に近いほど、モデルの判別力が高い</p>
      </div>
    </div>
  );
}

export default RocCurveChart;
