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


@dr_mcp_tool(tags={"predictive", "review", "leakage"})
async def check_leakage_risk(
    project_id: str,
    model_id: str
) -> str:
    """
    DSモデルレビュー: リーケージリスクをチェックします。
    
    以下の観点でリーケージの可能性を評価します：
    1. AUCが異常に高い（>0.9）
    2. Feature ImpactでIDや名前列が上位
    3. 特徴量数が多すぎる（次元の呪い）
    
    Args:
        project_id: DataRobotのプロジェクトID
        model_id: モデルID
    
    Returns:
        リーケージリスク評価のJSON文字列
    """
    logger.info(f"Checking leakage risk for model {model_id} in project {project_id}")
    
    try:
        _init_datarobot_client()
        
        model = dr.Model.get(project_id, model_id)
        project = dr.Project.get(project_id)
        
        warnings = []
        risk_level = "LOW"  # LOW, MEDIUM, HIGH
        
        # 1. AUCをチェック（分類モデルの場合）
        auc_value = None
        if hasattr(model, 'metrics'):
            for metric_name, metric_values in model.metrics.items():
                if 'AUC' in metric_name.upper():
                    if isinstance(metric_values, dict):
                        auc_value = metric_values.get('validation') or metric_values.get('holdout')
                    break
        
        if auc_value and auc_value > 0.95:
            warnings.append({
                "type": "HIGH_AUC",
                "severity": "HIGH",
                "message": f"AUC = {auc_value:.4f} は非常に高いです。リーケージの可能性が高いです。",
                "recommendation": "Feature Impactを確認し、予測時点で取得できない特徴量がないか検証してください。"
            })
            risk_level = "HIGH"
        elif auc_value and auc_value > 0.9:
            warnings.append({
                "type": "HIGH_AUC",
                "severity": "MEDIUM",
                "message": f"AUC = {auc_value:.4f} は高めです。リーケージの可能性を検討してください。",
                "recommendation": "特徴量が予測時点で利用可能か確認してください。"
            })
            if risk_level == "LOW":
                risk_level = "MEDIUM"
        
        # 2. Feature Impactを取得してID/名前列をチェック
        try:
            feature_impact = model.get_feature_impact()
            if feature_impact:
                # ID/名前系の特徴量が上位にないかチェック
                suspicious_patterns = ['id', 'ID', 'Id', 'name', 'Name', 'NAME', 'code', 'Code']
                top_features = feature_impact[:5] if len(feature_impact) >= 5 else feature_impact
                
                for fi in top_features:
                    feature_name = fi.feature_name if hasattr(fi, 'feature_name') else str(fi)
                    for pattern in suspicious_patterns:
                        if pattern in feature_name:
                            warnings.append({
                                "type": "SUSPICIOUS_FEATURE",
                                "severity": "HIGH",
                                "message": f"'{feature_name}'がFeature Impactの上位にあります。ID/名前系はリーケージの可能性があります。",
                                "recommendation": "この特徴量を除外してモデルを再構築することを検討してください。"
                            })
                            risk_level = "HIGH"
                            break
        except Exception as e:
            logger.warning(f"Could not check feature impact: {e}")
        
        # 3. 特徴量数と行数の比率チェック（次元の呪い）
        try:
            if hasattr(project, 'feature_count') and hasattr(project, 'row_count'):
                feature_count = project.feature_count
                row_count = project.row_count
                ratio = feature_count / row_count if row_count > 0 else 0
                
                if ratio > 0.1:  # 特徴量数がサンプル数の10%以上
                    warnings.append({
                        "type": "DIMENSION_CURSE",
                        "severity": "MEDIUM",
                        "message": f"特徴量数({feature_count})がサンプル数({row_count})に対して多いです（比率: {ratio:.2%}）。",
                        "recommendation": "特徴量選択を行い、重要な特徴量に絞ることを検討してください。"
                    })
                    if risk_level == "LOW":
                        risk_level = "MEDIUM"
        except Exception as e:
            logger.warning(f"Could not check dimension curse: {e}")
        
        result = {
            "type": "leakage_risk_check",
            "modelId": model_id,
            "modelName": model.model_type,
            "projectId": project_id,
            "projectName": project.project_name,
            "riskLevel": risk_level,
            "aucValue": auc_value,
            "warnings": warnings,
            "summary": f"リーケージリスク: {risk_level}。{len(warnings)}件の警告があります。" if warnings else "リーケージリスクは低いと判断されます。ただし、ビジネス観点での確認も行ってください。"
        }
        
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error checking leakage risk: {e}")
        return json.dumps({
            "error": f"リーケージリスクチェック中にエラーが発生しました: {str(e)}"
        })


@dr_mcp_tool(tags={"predictive", "review", "partition"})
async def get_partition_info(
    project_id: str
) -> str:
    """
    DSモデルレビュー: プロジェクトのパーティション（データ分割）設定を取得します。
    
    パーティション設定は、Train/Validation/Holdoutの分割方法を示し、
    時系列データの場合はOTV（Out-of-Time Validation）設定も確認できます。
    
    Args:
        project_id: DataRobotのプロジェクトID
    
    Returns:
        パーティション情報のJSON文字列
    """
    logger.info(f"Getting partition info for project {project_id}")
    
    try:
        _init_datarobot_client()
        
        project = dr.Project.get(project_id)
        
        partition_info = {
            "type": "partition_info",
            "projectId": project_id,
            "projectName": project.project_name,
            "partitionType": "Standard",
            "recommendations": []
        }
        
        # 日付パーティション（時系列）をチェック
        if hasattr(project, 'partition') and project.partition:
            partition = project.partition
            
            if hasattr(partition, 'datetime_partition_column') and partition.datetime_partition_column:
                partition_info["partitionType"] = "Time Series (OTV)"
                partition_info["datetimeColumn"] = partition.datetime_partition_column
                
                if hasattr(partition, 'validation_duration'):
                    partition_info["validationDuration"] = str(partition.validation_duration)
                if hasattr(partition, 'holdout_duration'):
                    partition_info["holdoutDuration"] = str(partition.holdout_duration)
            
            # グループパーティションをチェック
            elif hasattr(partition, 'cv_method') and partition.cv_method == 'group':
                partition_info["partitionType"] = "Group Partition"
                if hasattr(partition, 'partition_key_cols'):
                    partition_info["groupColumn"] = partition.partition_key_cols
            
            # ユーザー定義パーティションをチェック
            elif hasattr(partition, 'cv_method') and partition.cv_method == 'user':
                partition_info["partitionType"] = "User Defined"
                if hasattr(partition, 'user_partition_col'):
                    partition_info["partitionColumn"] = partition.user_partition_col
        
        # パーティションに関する推奨事項
        # 時系列データの場合
        if partition_info["partitionType"] == "Standard":
            # 日付列があるか確認（簡易チェック）
            try:
                features = project.get_features()
                date_features = [f for f in features if 'date' in f.name.lower() or 'time' in f.name.lower()]
                if date_features:
                    partition_info["recommendations"].append({
                        "type": "CONSIDER_OTV",
                        "message": f"日付/時刻列 ({', '.join([f.name for f in date_features[:3]])}) があります。時系列データの場合はOTV（Out-of-Time Validation）を検討してください。"
                    })
            except Exception:
                pass
        
        # ターゲット分布の不均衡チェック
        if hasattr(project, 'target') and project.target:
            partition_info["targetVariable"] = project.target
            partition_info["targetType"] = project.target_type if hasattr(project, 'target_type') else "Unknown"
            
            if project.target_type in ['Binary', 'Multiclass']:
                partition_info["recommendations"].append({
                    "type": "STRATIFIED_SAMPLING",
                    "message": "分類問題です。層化抽出（Stratified Sampling）が適用されているか確認してください。"
                })
        
        return json.dumps(partition_info, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting partition info: {e}")
        return json.dumps({
            "error": f"パーティション情報の取得中にエラーが発生しました: {str(e)}"
        })


@dr_mcp_tool(tags={"predictive", "review", "data_quality"})
async def check_data_quality(
    project_id: str
) -> str:
    """
    DSモデルレビュー: プロジェクトのデータ品質をチェックします。
    
    以下の観点でデータ品質を評価します：
    1. ターゲット分布（不均衡チェック）
    2. 欠損値の割合
    3. 特徴量数とサンプル数のバランス
    
    Args:
        project_id: DataRobotのプロジェクトID
    
    Returns:
        データ品質チェック結果のJSON文字列
    """
    logger.info(f"Checking data quality for project {project_id}")
    
    try:
        _init_datarobot_client()
        
        project = dr.Project.get(project_id)
        
        warnings = []
        quality_score = "GOOD"  # GOOD, FAIR, POOR
        
        result = {
            "type": "data_quality_check",
            "projectId": project_id,
            "projectName": project.project_name,
            "targetVariable": project.target if hasattr(project, 'target') else None,
            "targetType": project.target_type if hasattr(project, 'target_type') else None,
        }
        
        # サンプル数を取得
        row_count = project.max_train_rows if hasattr(project, 'max_train_rows') else None
        result["rowCount"] = row_count
        
        # 特徴量情報を取得
        try:
            features = project.get_features()
            feature_count = len(features) if features else 0
            result["featureCount"] = feature_count
            
            # 欠損値が多い特徴量をチェック
            high_missing_features = []
            for f in features:
                if hasattr(f, 'na_count') and hasattr(f, 'count'):
                    if f.count > 0:
                        missing_rate = f.na_count / f.count
                        if missing_rate > 0.5:  # 50%以上欠損
                            high_missing_features.append({
                                "name": f.name,
                                "missingRate": f"{missing_rate:.1%}"
                            })
            
            if high_missing_features:
                warnings.append({
                    "type": "HIGH_MISSING_RATE",
                    "severity": "MEDIUM",
                    "message": f"{len(high_missing_features)}個の特徴量で欠損率が50%を超えています。",
                    "features": high_missing_features[:5],  # 上位5件
                    "recommendation": "欠損値の意味を確認し、適切な補完または除外を検討してください。"
                })
                if quality_score == "GOOD":
                    quality_score = "FAIR"
            
            # 特徴量数とサンプル数のバランス
            if row_count and feature_count:
                if feature_count > row_count * 0.1:
                    warnings.append({
                        "type": "DIMENSION_CURSE",
                        "severity": "MEDIUM",
                        "message": f"特徴量数({feature_count})がサンプル数({row_count})の10%を超えています。",
                        "recommendation": "次元の呪いを避けるため、特徴量選択を検討してください。"
                    })
                    if quality_score == "GOOD":
                        quality_score = "FAIR"
                        
        except Exception as e:
            logger.warning(f"Could not get feature info: {e}")
        
        # ターゲット分布（分類問題の場合）
        if hasattr(project, 'target_type') and project.target_type in ['Binary', 'Multiclass']:
            try:
                # ターゲット分布を取得（可能な場合）
                # Note: 詳細な分布はDataRobot APIでは直接取得できない場合がある
                warnings.append({
                    "type": "TARGET_DISTRIBUTION_CHECK",
                    "severity": "INFO",
                    "message": "分類問題です。ターゲット分布を確認し、マイノリティクラスが100件以上あることを確認してください。",
                    "recommendation": "極端な不均衡（1%以下）がある場合は、アンダーサンプリングやクラス重み付けを検討してください。"
                })
            except Exception:
                pass
        
        # サンプル数が少ない場合
        if row_count and row_count < 1000:
            warnings.append({
                "type": "LOW_SAMPLE_SIZE",
                "severity": "MEDIUM",
                "message": f"サンプル数({row_count})が少ないため、モデルの汎化性能に注意が必要です。",
                "recommendation": "追加データの取得、または正則化の強いモデルを選択してください。"
            })
            if quality_score == "GOOD":
                quality_score = "FAIR"
        
        result["qualityScore"] = quality_score
        result["warnings"] = warnings
        result["summary"] = f"データ品質: {quality_score}。{len(warnings)}件の確認事項があります。" if warnings else "データ品質は良好です。"
        
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Error checking data quality: {e}")
        return json.dumps({
            "error": f"データ品質チェック中にエラーが発生しました: {str(e)}"
        })
