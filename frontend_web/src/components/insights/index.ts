/**
 * Insights Components Export
 *
 * DataRobotモデルインサイト可視化コンポーネントのエクスポート
 */

// 基本的なインサイトコンポーネント
export { FeatureImpactChart } from './FeatureImpactChart';
export type { FeatureImpactData, FeatureImpactChartProps } from './FeatureImpactChart';

export { ModelMetricsCard } from './ModelMetricsCard';
export type { ModelMetric, ModelMetricsCardProps } from './ModelMetricsCard';

export { ProjectListTable } from './ProjectListTable';
export type { Project, ProjectListTableProps } from './ProjectListTable';

export { ModelComparisonTable } from './ModelComparisonTable';
export type { ModelComparisonData, ModelComparisonTableProps } from './ModelComparisonTable';

// 追加のインサイトコンポーネント
export { RocCurveChart } from './RocCurveChart';
export type { RocCurvePoint, RocCurveChartProps } from './RocCurveChart';

export { LiftChart } from './LiftChart';
export type { LiftChartData, LiftChartProps } from './LiftChart';

export { FeatureEffectsChart } from './FeatureEffectsChart';
export type { FeatureEffectPoint, FeatureEffectsChartProps } from './FeatureEffectsChart';

export { PredictionExplanation } from './PredictionExplanation';
export type { ShapExplanation, PredictionExplanationProps } from './PredictionExplanation';

export { ConfusionMatrixChart } from './ConfusionMatrixChart';
export type { ConfusionMatrixData, ConfusionMatrixChartProps } from './ConfusionMatrixChart';

export { ResidualsChart } from './ResidualsChart';
export type { ResidualPoint, ResidualsChartProps } from './ResidualsChart';

// メインレンダラー
export { InsightRenderer, parseInsightFromMessage } from './InsightRenderer';
export type {
  InsightData,
  FeatureImpactInsight,
  ModelMetricsInsight,
  ProjectListInsight,
  ModelComparisonInsight,
  RocCurveInsight,
  LiftChartInsight,
  FeatureEffectsInsight,
  PredictionExplanationInsight,
  ConfusionMatrixInsight,
  ResidualsInsight,
} from './InsightRenderer';
