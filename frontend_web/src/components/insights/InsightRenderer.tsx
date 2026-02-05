/**
 * Insight Renderer Component
 *
 * エージェントからのJSON出力を自動的に検出し、
 * 適切なインサイトコンポーネントでレンダリングします。
 */
import { useMemo } from 'react';
import { FeatureImpactChart, type FeatureImpactData } from './FeatureImpactChart';
import { ModelMetricsCard, type ModelMetric } from './ModelMetricsCard';
import { ProjectListTable, type Project } from './ProjectListTable';
import { ModelComparisonTable, type ModelComparisonData } from './ModelComparisonTable';
import { RocCurveChart, type RocCurveDataPoint } from './RocCurveChart';
import { LiftChart, type LiftChartDataPoint } from './LiftChart';
import { FeatureEffectsChart, type FeatureEffectDataPoint } from './FeatureEffectsChart';
import { PredictionExplanation, type ShapExplanation } from './PredictionExplanation';
import { ConfusionMatrixChart, type ConfusionMatrixData } from './ConfusionMatrixChart';
import { ResidualsChart, type ResidualPoint } from './ResidualsChart';
import { TimeSeriesForecastChart, type TimeSeriesDataPoint } from './TimeSeriesForecastChart';

// インサイトデータの型定義
export interface FeatureImpactInsight {
  type: 'feature_impact';
  modelName?: string;
  projectName?: string;
  data: FeatureImpactData[];
}

export interface ModelMetricsInsight {
  type: 'model_metrics';
  modelName: string;
  modelType?: string;
  projectName?: string;
  metrics: ModelMetric[];
}

export interface ProjectListInsight {
  type: 'project_list';
  projects: Project[];
}

export interface ModelComparisonInsight {
  type: 'model_comparison';
  models: ModelComparisonData[];
  primaryMetric?: string;
}

export interface RocCurveInsight {
  type: 'roc_curve';
  modelName?: string;
  projectName?: string;
  auc: number;
  data: RocCurveDataPoint[];
}

export interface LiftChartInsight {
  type: 'lift_chart';
  modelName?: string;
  projectName?: string;
  data: LiftChartDataPoint[];
}

export interface FeatureEffectsInsight {
  type: 'feature_effects';
  modelName?: string;
  projectName?: string;
  featureName: string;
  data: FeatureEffectDataPoint[];
}

export interface PredictionExplanationInsight {
  type: 'prediction_explanation';
  modelName?: string;
  projectName?: string;
  prediction?: number;
  baseValue?: number;
  explanations: ShapExplanation[];
}

export interface ConfusionMatrixInsight {
  type: 'confusion_matrix';
  modelName?: string;
  projectName?: string;
  matrix: ConfusionMatrixData;
}

export interface ResidualsInsight {
  type: 'residuals';
  modelName?: string;
  projectName?: string;
  residuals: ResidualPoint[];
}

export interface TimeSeriesForecastInsight {
  type: 'time_series_forecast';
  modelName?: string;
  projectName?: string;
  data: TimeSeriesDataPoint[];
  forecastStartIndex?: number;
  yAxisLabel?: string;
}

export type InsightData =
  | FeatureImpactInsight
  | ModelMetricsInsight
  | ProjectListInsight
  | ModelComparisonInsight
  | RocCurveInsight
  | LiftChartInsight
  | FeatureEffectsInsight
  | PredictionExplanationInsight
  | ConfusionMatrixInsight
  | ResidualsInsight
  | TimeSeriesForecastInsight;

export interface InsightRendererProps {
  insight: InsightData;
  onProjectSelect?: (project: Project) => void;
}

// サポートされているインサイトタイプの一覧
const VALID_INSIGHT_TYPES = [
  'feature_impact',
  'model_metrics',
  'project_list',
  'model_comparison',
  'roc_curve',
  'lift_chart',
  'feature_effects',
  'prediction_explanation',
  'confusion_matrix',
  'residuals',
  'time_series_forecast',
] as const;

/**
 * メッセージテキストからJSONインサイトデータを抽出
 */
export function parseInsightFromMessage(text: string): InsightData | null {
  // ```json ブロックを探す
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed.type && isValidInsightType(parsed.type)) {
        return parsed as InsightData;
      }
    } catch (e) {
      console.warn('Failed to parse JSON block:', e);
    }
  }

  // コードフェンスなしのJSONオブジェクトを探す（すべてのインサイトタイプに対応）
  const typePattern = VALID_INSIGHT_TYPES.join('|');
  const jsonObjectMatch = text.match(new RegExp(`\\{[\\s\\S]*"type"\\s*:\\s*"(${typePattern})"[\\s\\S]*\\}`));
  if (jsonObjectMatch) {
    try {
      // JSON部分だけを抽出（最初の { から最後の } まで）
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed.type && isValidInsightType(parsed.type)) {
          return parsed as InsightData;
        }
      }
    } catch (e) {
      console.warn('Failed to parse inline JSON:', e);
    }
  }

  return null;
}

function isValidInsightType(type: string): boolean {
  return VALID_INSIGHT_TYPES.includes(type as typeof VALID_INSIGHT_TYPES[number]);
}

/**
 * インサイトデータに応じた適切なコンポーネントをレンダリング
 */
export function InsightRenderer({ insight, onProjectSelect }: InsightRendererProps) {
  const component = useMemo(() => {
    switch (insight.type) {
      case 'feature_impact':
        return (
          <FeatureImpactChart
            data={insight.data}
            title={insight.modelName ? `${insight.modelName} の特徴量重要度` : undefined}
          />
        );

      case 'model_metrics':
        return (
          <ModelMetricsCard
            modelName={insight.modelName}
            modelType={insight.modelType}
            metrics={insight.metrics}
            projectName={insight.projectName}
          />
        );

      case 'project_list':
        return (
          <ProjectListTable
            projects={insight.projects}
            onProjectSelect={onProjectSelect}
          />
        );

      case 'model_comparison':
        return (
          <ModelComparisonTable
            models={insight.models}
            primaryMetric={insight.primaryMetric}
          />
        );

      case 'roc_curve':
        return (
          <RocCurveChart
            data={insight.data}
            auc={insight.auc}
            modelName={insight.modelName}
            projectName={insight.projectName}
          />
        );

      case 'lift_chart':
        return (
          <LiftChart
            data={insight.data}
            modelName={insight.modelName}
            projectName={insight.projectName}
          />
        );

      case 'feature_effects':
        return (
          <FeatureEffectsChart
            data={insight.data}
            featureName={insight.featureName}
            modelName={insight.modelName}
            projectName={insight.projectName}
          />
        );

      case 'prediction_explanation':
        return (
          <PredictionExplanation
            explanations={insight.explanations}
            prediction={insight.prediction}
            baseValue={insight.baseValue}
            modelName={insight.modelName}
            projectName={insight.projectName}
          />
        );

      case 'confusion_matrix':
        return (
          <ConfusionMatrixChart
            matrix={insight.matrix}
            modelName={insight.modelName}
            projectName={insight.projectName}
          />
        );

      case 'residuals':
        return (
          <ResidualsChart
            residuals={insight.residuals}
            modelName={insight.modelName}
            projectName={insight.projectName}
          />
        );

      case 'time_series_forecast':
        return (
          <TimeSeriesForecastChart
            data={insight.data}
            modelName={insight.modelName}
            projectName={insight.projectName}
            forecastStartIndex={insight.forecastStartIndex}
            yAxisLabel={insight.yAxisLabel}
          />
        );

      default:
        return null;
    }
  }, [insight, onProjectSelect]);

  return <div className="my-4">{component}</div>;
}

export default InsightRenderer;
