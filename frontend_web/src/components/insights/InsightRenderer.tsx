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

export type InsightData =
  | FeatureImpactInsight
  | ModelMetricsInsight
  | ProjectListInsight
  | ModelComparisonInsight;

export interface InsightRendererProps {
  insight: InsightData;
  onProjectSelect?: (project: Project) => void;
}

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

  // コードフェンスなしのJSONオブジェクトを探す
  const jsonObjectMatch = text.match(/\{[\s\S]*"type"\s*:\s*"(feature_impact|model_metrics|project_list|model_comparison)"[\s\S]*\}/);
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
  return ['feature_impact', 'model_metrics', 'project_list', 'model_comparison'].includes(type);
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

      default:
        return null;
    }
  }, [insight, onProjectSelect]);

  return <div className="my-4">{component}</div>;
}

export default InsightRenderer;
