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
"""
AutoPilot Monitor

DataRobot AutoPilot の進捗を監視するバックグラウンドジョブ。
プロジェクトの状態をポーリングし、進捗をクライアントに通知。
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, Optional
from uuid import UUID

import httpx

from app.jobs.manager import JobManager, JobStatus

logger = logging.getLogger(__name__)


class AutoPilotStage(str, Enum):
    """AutoPilot のステージ"""
    PREPARING = "preparing"           # 準備中
    EDA = "eda"                        # 探索的データ分析
    FEATURE_ENGINEERING = "feature_engineering"  # 特徴量エンジニアリング
    MODELING = "modeling"              # モデル構築
    SELECTING_BEST = "selecting_best"  # 最良モデル選択
    COMPLETED = "completed"            # 完了
    FAILED = "failed"                  # 失敗


@dataclass
class AutoPilotProgress:
    """AutoPilot 進捗情報"""
    project_id: str
    stage: AutoPilotStage
    progress_percent: float
    models_completed: int
    total_models: int
    current_model_type: Optional[str] = None
    estimated_time_remaining: Optional[int] = None  # 秒
    error_message: Optional[str] = None


class AutoPilotMonitor:
    """
    AutoPilot 進捗監視クラス

    DataRobot プロジェクトの AutoPilot 実行状況を定期的にポーリングし、
    進捗をコールバックで通知します。

    使用例:
        monitor = AutoPilotMonitor(
            api_token="your_token",
            endpoint="https://app.datarobot.com/api/v2",
        )

        progress = await monitor.get_progress(project_id)
        print(f"Progress: {progress.progress_percent}%")
    """

    def __init__(
        self,
        api_token: str,
        endpoint: str,
        poll_interval: int = 10,  # 秒
    ) -> None:
        self.api_token = api_token
        self.endpoint = endpoint.rstrip("/")
        self.poll_interval = poll_interval
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """HTTP クライアントを取得（遅延初期化）"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._client

    async def close(self) -> None:
        """クライアントをクローズ"""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def get_progress(self, project_id: str) -> AutoPilotProgress:
        """
        AutoPilot の現在の進捗を取得

        Args:
            project_id: DataRobot プロジェクト ID

        Returns:
            AutoPilotProgress: 進捗情報
        """
        client = await self._get_client()

        try:
            # プロジェクト情報を取得
            project_response = await client.get(
                f"{self.endpoint}/projects/{project_id}/"
            )
            project_response.raise_for_status()
            project = project_response.json()

            # モデル一覧を取得
            models_response = await client.get(
                f"{self.endpoint}/projects/{project_id}/models/"
            )
            models_response.raise_for_status()
            models = models_response.json()

            # プロジェクトステータスをパース
            stage = self._parse_stage(project.get("stage", ""))
            autopilot_done = project.get("autopilotDone", False)

            if autopilot_done:
                stage = AutoPilotStage.COMPLETED
                progress_percent = 100.0
            else:
                # モデル数から進捗を推定
                total_models = project.get("targetedModelCount", 0) or 20  # デフォルト値
                models_completed = len(models)
                progress_percent = min(
                    (models_completed / total_models) * 100, 99.0
                )

            return AutoPilotProgress(
                project_id=project_id,
                stage=stage,
                progress_percent=progress_percent,
                models_completed=len(models),
                total_models=project.get("targetedModelCount", 0) or 20,
                current_model_type=self._get_current_model_type(models),
                estimated_time_remaining=self._estimate_remaining_time(
                    progress_percent, project
                ),
            )

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error getting project status: {e}")
            return AutoPilotProgress(
                project_id=project_id,
                stage=AutoPilotStage.FAILED,
                progress_percent=0.0,
                models_completed=0,
                total_models=0,
                error_message=str(e),
            )
        except Exception as e:
            logger.exception("Error getting AutoPilot progress")
            return AutoPilotProgress(
                project_id=project_id,
                stage=AutoPilotStage.FAILED,
                progress_percent=0.0,
                models_completed=0,
                total_models=0,
                error_message=str(e),
            )

    def _parse_stage(self, stage_str: str) -> AutoPilotStage:
        """プロジェクトステージ文字列をパース"""
        stage_mapping = {
            "eda": AutoPilotStage.EDA,
            "modeling": AutoPilotStage.MODELING,
            "fitting": AutoPilotStage.MODELING,
            "feature": AutoPilotStage.FEATURE_ENGINEERING,
            "complete": AutoPilotStage.COMPLETED,
        }

        for key, value in stage_mapping.items():
            if key in stage_str.lower():
                return value

        return AutoPilotStage.PREPARING

    def _get_current_model_type(self, models: list[Dict[str, Any]]) -> Optional[str]:
        """現在構築中のモデルタイプを取得"""
        if not models:
            return None

        # 最新のモデルを取得
        sorted_models = sorted(
            models,
            key=lambda m: m.get("createdAt", ""),
            reverse=True,
        )
        if sorted_models:
            return sorted_models[0].get("modelType", "Unknown")
        return None

    def _estimate_remaining_time(
        self, progress: float, project: Dict[str, Any]
    ) -> Optional[int]:
        """残り時間を推定（秒）"""
        if progress <= 0:
            return None

        # 開始時刻から経過時間を計算
        created_at_str = project.get("created")
        if not created_at_str:
            return None

        try:
            created_at = datetime.fromisoformat(
                created_at_str.replace("Z", "+00:00")
            )
            elapsed = (datetime.now(created_at.tzinfo) - created_at).total_seconds()

            # 進捗率から残り時間を推定
            if progress > 0:
                total_estimated = elapsed / (progress / 100)
                remaining = total_estimated - elapsed
                return max(int(remaining), 0)
        except Exception:
            pass

        return None

    async def monitor_until_complete(
        self,
        project_id: str,
        job_manager: JobManager,
        job_id: UUID,
        on_progress: Optional[Callable[[AutoPilotProgress], Coroutine[Any, Any, None]]] = None,
    ) -> AutoPilotProgress:
        """
        AutoPilot が完了するまで監視

        Args:
            project_id: DataRobot プロジェクト ID
            job_manager: ジョブマネージャー
            job_id: 関連するジョブ ID
            on_progress: 進捗更新時のコールバック

        Returns:
            AutoPilotProgress: 最終的な進捗情報
        """
        logger.info(f"Starting AutoPilot monitoring for project: {project_id}")

        while True:
            progress = await self.get_progress(project_id)

            # ジョブマネージャーを更新
            await job_manager.update_job(
                job_id,
                progress=progress.progress_percent / 100,
                message=f"{progress.stage.value}: {progress.models_completed}/{progress.total_models} models",
            )

            # コールバック呼び出し
            if on_progress:
                await on_progress(progress)

            # 完了またはエラーでループ終了
            if progress.stage in (AutoPilotStage.COMPLETED, AutoPilotStage.FAILED):
                logger.info(
                    f"AutoPilot monitoring complete for project {project_id}: {progress.stage}"
                )
                return progress

            # 次のポーリングまで待機
            await asyncio.sleep(self.poll_interval)


async def create_autopilot_monitor_task(
    api_token: str,
    endpoint: str,
    project_id: str,
    job_manager: JobManager,
    job_id: UUID,
    on_progress: Optional[Callable[[AutoPilotProgress], Coroutine[Any, Any, None]]] = None,
) -> AutoPilotProgress:
    """
    AutoPilot 監視タスクを作成するファクトリ関数

    ジョブマネージャーと組み合わせて使用:

        job_id = await job_manager.create_job(
            job_type="autopilot_monitor",
            user_id=user_id,
            task=create_autopilot_monitor_task(
                api_token=token,
                endpoint=endpoint,
                project_id=project_id,
                job_manager=job_manager,
                job_id=job_id,  # 事前に生成
            ),
        )
    """
    monitor = AutoPilotMonitor(api_token, endpoint)
    try:
        return await monitor.monitor_until_complete(
            project_id, job_manager, job_id, on_progress
        )
    finally:
        await monitor.close()
