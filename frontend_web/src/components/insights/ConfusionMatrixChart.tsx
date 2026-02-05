/**
 * Confusion Matrix Component
 *
 * 分類モデルの混同行列を表示するコンポーネント
 */

export interface ConfusionMatrixData {
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  positiveLabel?: string;
  negativeLabel?: string;
}

export interface ConfusionMatrixChartProps {
  matrix: ConfusionMatrixData;
  modelName?: string;
  projectName?: string;
}

export function ConfusionMatrixChart({
  matrix,
  modelName,
  projectName,
}: ConfusionMatrixChartProps) {
  const { truePositives, trueNegatives, falsePositives, falseNegatives } = matrix;
  const posLabel = matrix.positiveLabel || 'Positive';
  const negLabel = matrix.negativeLabel || 'Negative';

  // 合計値
  const total = truePositives + trueNegatives + falsePositives + falseNegatives;
  const actualPositives = truePositives + falseNegatives;
  const actualNegatives = trueNegatives + falsePositives;
  const predictedPositives = truePositives + falsePositives;
  const predictedNegatives = trueNegatives + falseNegatives;

  // 評価指標の計算
  const accuracy = total > 0 ? ((truePositives + trueNegatives) / total) * 100 : 0;
  const precision = predictedPositives > 0 ? (truePositives / predictedPositives) * 100 : 0;
  const recall = actualPositives > 0 ? (truePositives / actualPositives) * 100 : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const specificity = actualNegatives > 0 ? (trueNegatives / actualNegatives) * 100 : 0;

  // セルの背景色の濃さを計算
  const maxValue = Math.max(truePositives, trueNegatives, falsePositives, falseNegatives);
  const getOpacity = (value: number) => (maxValue > 0 ? 0.3 + (value / maxValue) * 0.7 : 0.3);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* ヘッダー */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#81FBA5]">📊</span>
          混同行列 (Confusion Matrix)
        </h3>
        {(modelName || projectName) && (
          <p className="text-sm text-gray-600 mt-1">
            {modelName && <span className="font-medium">{modelName}</span>}
            {modelName && projectName && ' - '}
            {projectName && <span>{projectName}</span>}
          </p>
        )}
      </div>

      {/* 混同行列 */}
      <div className="flex justify-center mb-6">
        <div className="inline-block">
          {/* 列ヘッダー */}
          <div className="flex">
            <div className="w-24"></div>
            <div className="w-8"></div>
            <div className="text-center text-sm text-gray-600 font-medium" style={{ width: '200px' }}>
              予測 (Predicted)
            </div>
          </div>
          <div className="flex">
            <div className="w-24"></div>
            <div className="w-8"></div>
            <div className="flex">
              <div className="w-24 text-center text-sm text-gray-500 py-2">{posLabel}</div>
              <div className="w-24 text-center text-sm text-gray-500 py-2">{negLabel}</div>
            </div>
          </div>

          {/* 行 */}
          <div className="flex items-center">
            {/* 行ヘッダー */}
            <div className="w-24 flex items-center justify-center">
              <span
                className="text-sm text-gray-600 font-medium transform -rotate-90 whitespace-nowrap"
              >
                実際 (Actual)
              </span>
            </div>
            <div className="flex flex-col w-8">
              <div className="h-24 flex items-center justify-center text-sm text-gray-500">{posLabel}</div>
              <div className="h-24 flex items-center justify-center text-sm text-gray-500">{negLabel}</div>
            </div>

            {/* マトリックスセル */}
            <div className="grid grid-cols-2 gap-1">
              {/* True Positives (正解: Positive, 予測: Positive) */}
              <div
                className="w-24 h-24 flex flex-col items-center justify-center rounded-lg border-2 border-green-400"
                style={{ backgroundColor: `rgba(129, 251, 165, ${getOpacity(truePositives)})` }}
              >
                <span className="text-2xl font-bold text-gray-800">{truePositives.toLocaleString()}</span>
                <span className="text-xs text-gray-600 mt-1">TP</span>
              </div>

              {/* False Negatives (正解: Positive, 予測: Negative) */}
              <div
                className="w-24 h-24 flex flex-col items-center justify-center rounded-lg border-2 border-red-300"
                style={{ backgroundColor: `rgba(248, 113, 113, ${getOpacity(falseNegatives)})` }}
              >
                <span className="text-2xl font-bold text-gray-800">{falseNegatives.toLocaleString()}</span>
                <span className="text-xs text-gray-600 mt-1">FN</span>
              </div>

              {/* False Positives (正解: Negative, 予測: Positive) */}
              <div
                className="w-24 h-24 flex flex-col items-center justify-center rounded-lg border-2 border-red-300"
                style={{ backgroundColor: `rgba(248, 113, 113, ${getOpacity(falsePositives)})` }}
              >
                <span className="text-2xl font-bold text-gray-800">{falsePositives.toLocaleString()}</span>
                <span className="text-xs text-gray-600 mt-1">FP</span>
              </div>

              {/* True Negatives (正解: Negative, 予測: Negative) */}
              <div
                className="w-24 h-24 flex flex-col items-center justify-center rounded-lg border-2 border-green-400"
                style={{ backgroundColor: `rgba(129, 251, 165, ${getOpacity(trueNegatives)})` }}
              >
                <span className="text-2xl font-bold text-gray-800">{trueNegatives.toLocaleString()}</span>
                <span className="text-xs text-gray-600 mt-1">TN</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 評価指標 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">正解率 (Accuracy)</p>
          <p className="text-xl font-bold text-[#81FBA5]">{accuracy.toFixed(1)}%</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">適合率 (Precision)</p>
          <p className="text-xl font-bold text-blue-600">{precision.toFixed(1)}%</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">再現率 (Recall)</p>
          <p className="text-xl font-bold text-purple-600">{recall.toFixed(1)}%</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">F1スコア</p>
          <p className="text-xl font-bold text-orange-600">{f1Score.toFixed(1)}%</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">特異度 (Specificity)</p>
          <p className="text-xl font-bold text-gray-600">{specificity.toFixed(1)}%</p>
        </div>
      </div>

      {/* 凡例と説明 */}
      <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
        <p><strong>TP (True Positive)</strong>: 実際に陽性で、正しく陽性と予測</p>
        <p><strong>TN (True Negative)</strong>: 実際に陰性で、正しく陰性と予測</p>
        <p><strong>FP (False Positive)</strong>: 実際は陰性だが、誤って陽性と予測（偽陽性）</p>
        <p><strong>FN (False Negative)</strong>: 実際は陽性だが、誤って陰性と予測（偽陰性）</p>
      </div>
    </div>
  );
}

export default ConfusionMatrixChart;
