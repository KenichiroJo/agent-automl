# Copyright 2025 DataRobot, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json
import logging
import os
from typing import Optional

import datarobot as dr
from datarobot_genai.drmcp import dr_mcp_tool

logger = logging.getLogger(__name__)

"""
DataRobot インサイト機能を提供するMCPツール

既存の datarobot_genai で提供されているツールを補完し、
追加のインサイト機能を提供します。
"""


def _init_datarobot_client() -> None:
    """DataRobotクライアントを初期化"""
    endpoint = os.environ.get("DATAROBOT_ENDPOINT")
    token = os.environ.get("DATAROBOT_API_TOKEN")
    if endpoint and token:
        dr.Client(endpoint=endpoint, token=token)


@dr_mcp_tool(tags={"predictive", "insight", "confusion"})
async def get_model_confusion_matrix(
    project_id: str,
    model_id: str,
    source: str = "validation"
) -> str:
    """
    分類モデルの混同行列（Confusion Matrix）を取得します。
    
    混同行列は、モデルの予測結果と実際の値を比較し、
    True Positive、True Negative、False Positive、False Negativeの
    各カウントを表示します。
    
    Args:
        project_id: DataRobotのプロジェクトID
        model_id: モデルID
        source: データソース（"validation", "holdout", "crossValidation"のいずれか）
    
    Returns:
        混同行列のJSON文字列
    """
    logger.info(f"Getting confusion matrix for model {model_id} in project {project_id}")
    
    try:
        _init_datarobot_client()
        
        model = dr.Model.get(project_id, model_id)
        
        # 混同行列を取得
        confusion = model.get_confusion_chart(source=source)
        
        if confusion is None:
            return json.dumps({
                "error": "混同行列を取得できませんでした。このモデルは分類モデルではないか、まだ計算されていない可能性があります。"
            })
        
        # 結果を整形
        result = {
            "type": "confusion_matrix",
            "modelId": model_id,
            "projectId": project_id,
            "source": source,
            "data": confusion.raw_data if hasattr(confusion, 'raw_data') else str(confusion)
        }
        
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting confusion matrix: {e}")
        return json.dumps({
            "error": f"混同行列の取得中にエラーが発生しました: {str(e)}"
        })


@dr_mcp_tool(tags={"predictive", "insight", "feature_effects"})
async def get_model_feature_effects(
    project_id: str,
    model_id: str,
    source: str = "validation"
) -> str:
    """
    モデルのFeature Effects（特徴量ごとの作用/部分依存プロット）を取得します。
    
    Feature Effectsは、各特徴量の値がモデルの予測にどのように影響するかを
    示します。Feature Impactの後に計算されます。
    
    Args:
        project_id: DataRobotのプロジェクトID
        model_id: モデルID
        source: データソース（"validation", "holdout", "crossValidation"のいずれか）
    
    Returns:
        Feature EffectsのJSON文字列
    """
    logger.info(f"Getting feature effects for model {model_id} in project {project_id}")
    
    try:
        _init_datarobot_client()
        
        model = dr.Model.get(project_id, model_id)
        
        # Feature Effectsを取得（まず計算を開始し、完了を待つ）
        try:
            feature_effects_job = model.request_feature_effect(source=source)
            feature_effects_job.wait_for_completion()
        except dr.errors.JobAlreadyRequested:
            # 既に計算済みの場合はスキップ
            pass
        
        # 計算結果を取得
        feature_effects = model.get_feature_effect(source=source)
        
        if feature_effects is None:
            return json.dumps({
                "error": "Feature Effectsを取得できませんでした。先にFeature Impactを計算してください。"
            })
        
        # 結果を整形
        effects_list = []
        for fe in feature_effects:
            effects_list.append({
                "featureName": fe.feature_name,
                "featureType": fe.feature_type,
                "partialDependence": fe.partial_dependence if hasattr(fe, 'partial_dependence') else None
            })
        
        result = {
            "type": "feature_effects",
            "modelId": model_id,
            "projectId": project_id,
            "source": source,
            "data": effects_list[:10]  # 上位10件
        }
        
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting feature effects: {e}")
        return json.dumps({
            "error": f"Feature Effectsの取得中にエラーが発生しました: {str(e)}"
        })


@dr_mcp_tool(tags={"predictive", "insight", "shap"})
async def get_model_shap_impact(
    project_id: str,
    model_id: str
) -> str:
    """
    モデルのSHAP Impact（SHAP値に基づく特徴量重要度）を取得します。
    
    SHAP Impactは、SHAP値の絶対値の平均を使用して
    各特徴量がモデルの予測にどれだけ貢献しているかを示します。
    Feature Impactよりも解釈しやすい場合があります。
    
    Args:
        project_id: DataRobotのプロジェクトID
        model_id: モデルID
    
    Returns:
        SHAP ImpactのJSON文字列
    """
    logger.info(f"Getting SHAP impact for model {model_id} in project {project_id}")
    
    try:
        _init_datarobot_client()
        
        model = dr.Model.get(project_id, model_id)
        
        # SHAP Impactを取得（計算が必要な場合は自動的に開始）
        try:
            shap_impact_job = model.request_shap_impact()
            shap_impact_job.wait_for_completion()
        except (dr.errors.JobAlreadyRequested, AttributeError):
            # 既に計算済みの場合、またはメソッドがない場合はスキップ
            pass
        
        # SHAP Impactを取得
        shap_impact = dr.ShapImpact.list(project_id, model_id)
        
        if not shap_impact:
            return json.dumps({
                "error": "SHAP Impactを取得できませんでした。このモデルはSHAPをサポートしていない可能性があります。"
            })
        
        # 結果を整形
        impact_list = []
        for si in shap_impact[:10]:  # 上位10件
            impact_list.append({
                "featureName": si.feature_name,
                "impactNormalized": si.impact_normalized,
                "impactUnnormalized": si.impact_unnormalized
            })
        
        result = {
            "type": "shap_impact",
            "modelId": model_id,
            "projectId": project_id,
            "data": impact_list
        }
        
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting SHAP impact: {e}")
        return json.dumps({
            "error": f"SHAP Impactの取得中にエラーが発生しました: {str(e)}"
        })


@dr_mcp_tool(tags={"predictive", "insight", "residuals"})
async def get_model_residuals(
    project_id: str,
    model_id: str,
    source: str = "validation"
) -> str:
    """
    回帰モデルの残差（Residuals）を取得します。
    
    残差は予測値と実測値の差であり、モデルの誤差パターンを
    理解するのに役立ちます。
    
    Args:
        project_id: DataRobotのプロジェクトID
        model_id: モデルID
        source: データソース（"validation", "holdout", "crossValidation"のいずれか）
    
    Returns:
        残差情報のJSON文字列
    """
    logger.info(f"Getting residuals for model {model_id} in project {project_id}")
    
    try:
        _init_datarobot_client()
        
        model = dr.Model.get(project_id, model_id)
        
        # 残差チャートを取得
        residuals = model.get_residuals_chart(source=source)
        
        if residuals is None:
            return json.dumps({
                "error": "残差を取得できませんでした。このモデルは回帰モデルではないか、まだ計算されていない可能性があります。"
            })
        
        result = {
            "type": "residuals",
            "modelId": model_id,
            "projectId": project_id,
            "source": source,
            "data": residuals.bins if hasattr(residuals, 'bins') else str(residuals)
        }
        
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting residuals: {e}")
        return json.dumps({
            "error": f"残差の取得中にエラーが発生しました: {str(e)}"
        })


@dr_mcp_tool(tags={"predictive", "insight", "summary"})
async def get_available_insights(
    project_id: str,
    model_id: str
) -> str:
    """
    指定されたモデルで利用可能なインサイト機能の一覧を取得します。
    
    各インサイト機能が計算済みか、利用可能かを確認し、
    ユーザーに何が分析できるかを示します。
    
    Args:
        project_id: DataRobotのプロジェクトID
        model_id: モデルID
    
    Returns:
        利用可能なインサイトの一覧（JSON文字列）
    """
    logger.info(f"Getting available insights for model {model_id} in project {project_id}")
    
    try:
        _init_datarobot_client()
        
        model = dr.Model.get(project_id, model_id)
        project = dr.Project.get(project_id)
        
        # プロジェクトタイプを確認
        is_classification = project.target_type in ['Binary', 'Multiclass']
        is_regression = project.target_type == 'Regression'
        is_timeseries = hasattr(project, 'datetime_partition_column') and project.datetime_partition_column
        
        insights = {
            "type": "available_insights",
            "modelId": model_id,
            "modelName": model.model_type,
            "projectId": project_id,
            "projectName": project.project_name,
            "targetType": project.target_type,
            "insights": []
        }
        
        # Feature Impact（全モデルで利用可能）
        insights["insights"].append({
            "name": "Feature Impact",
            "description": "特徴量の重要度。モデルの予測に各特徴量がどれだけ貢献しているか。",
            "available": True,
            "command": "get_model_feature_impact"
        })
        
        # Feature Effects
        insights["insights"].append({
            "name": "Feature Effects",
            "description": "特徴量ごとの作用（部分依存プロット）。値の変化が予測にどう影響するか。",
            "available": True,
            "command": "get_model_feature_effects"
        })
        
        # SHAP Impact
        insights["insights"].append({
            "name": "SHAP Impact",
            "description": "SHAP値に基づく特徴量重要度。より解釈しやすい重要度スコア。",
            "available": True,
            "command": "get_model_shap_impact"
        })
        
        # 分類モデル向け
        if is_classification:
            insights["insights"].append({
                "name": "ROC曲線",
                "description": "True Positive RateとFalse Positive Rateのトレードオフを視覚化。",
                "available": True,
                "command": "get_model_roc_curve"
            })
            insights["insights"].append({
                "name": "リフトチャート",
                "description": "モデルがターゲットをどれだけうまく分離できるかを示す。",
                "available": True,
                "command": "get_model_lift_chart"
            })
            insights["insights"].append({
                "name": "混同行列",
                "description": "予測結果と実際の値の比較表。誤分類パターンを把握。",
                "available": True,
                "command": "get_model_confusion_matrix"
            })
        
        # 回帰モデル向け
        if is_regression:
            insights["insights"].append({
                "name": "残差分析",
                "description": "予測値と実測値の差（誤差）を分析。モデルの偏りを把握。",
                "available": True,
                "command": "get_model_residuals"
            })
        
        # 時系列向け
        if is_timeseries:
            insights["insights"].append({
                "name": "時系列精度",
                "description": "予測距離ごとの精度。短期vs長期予測の性能差を把握。",
                "available": True,
                "command": "（時系列専用ツールを使用）"
            })
        
        return json.dumps(insights, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting available insights: {e}")
        return json.dumps({
            "error": f"利用可能なインサイトの取得中にエラーが発生しました: {str(e)}"
        })


@dr_mcp_tool(tags={"predictive", "model", "blueprint"})
async def get_model_blueprint(
    project_id: str,
    model_id: str
) -> str:
    """
    モデルのブループリント（構築方法）の詳細を取得します。
    
    ブループリントは、モデルがどのような前処理、特徴量変換、
    アルゴリズムを使用して構築されたかを示します。
    
    Args:
        project_id: DataRobotのプロジェクトID
        model_id: モデルID
    
    Returns:
        ブループリント情報のJSON文字列
    """
    logger.info(f"Getting blueprint for model {model_id} in project {project_id}")
    
    try:
        _init_datarobot_client()
        
        model = dr.Model.get(project_id, model_id)
        blueprint = model.get_blueprint_representation()
        
        if blueprint is None:
            return json.dumps({
                "error": "ブループリントを取得できませんでした。"
            })
        
        result = {
            "type": "model_blueprint",
            "modelId": model_id,
            "modelName": model.model_type,
            "projectId": project_id,
            "blueprint": str(blueprint)
        }
        
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting blueprint: {e}")
        return json.dumps({
            "error": f"ブループリントの取得中にエラーが発生しました: {str(e)}"
        })
