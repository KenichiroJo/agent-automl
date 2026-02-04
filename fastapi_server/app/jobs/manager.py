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
Job Manager

バックグラウンドジョブの管理を行う汎用マネージャー。
ジョブの登録、状態追跡、コールバック通知を提供。
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, Optional
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """ジョブのステータス"""
    PENDING = "pending"       # 開始待ち
    RUNNING = "running"       # 実行中
    COMPLETED = "completed"   # 正常完了
    FAILED = "failed"         # 失敗
    CANCELLED = "cancelled"   # キャンセル済み


@dataclass
class JobInfo:
    """ジョブ情報"""
    job_id: UUID
    job_type: str
    status: JobStatus
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    progress: float = 0.0  # 0.0 ~ 1.0
    message: str = ""
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# コールバック型定義
JobCallback = Callable[[JobInfo], Coroutine[Any, Any, None]]


class JobManager:
    """
    バックグラウンドジョブマネージャー

    非同期タスクを管理し、進捗状況を追跡します。
    WebSocket やポーリングでクライアントに進捗を通知可能。

    使用例:
        manager = JobManager()

        # ジョブを登録
        job_id = await manager.create_job(
            job_type="autopilot",
            user_id=user_uuid,
            task=monitor_autopilot(project_id),
            on_progress=notify_client,
        )

        # ジョブ状態を取得
        job = manager.get_job(job_id)
    """

    def __init__(self) -> None:
        self._jobs: Dict[UUID, JobInfo] = {}
        self._tasks: Dict[UUID, asyncio.Task[Any]] = {}
        self._callbacks: Dict[UUID, list[JobCallback]] = {}
        self._lock = asyncio.Lock()

    async def create_job(
        self,
        job_type: str,
        user_id: UUID,
        task: Coroutine[Any, Any, Any],
        metadata: Optional[Dict[str, Any]] = None,
        on_progress: Optional[JobCallback] = None,
        on_complete: Optional[JobCallback] = None,
    ) -> UUID:
        """
        新しいバックグラウンドジョブを作成・開始

        Args:
            job_type: ジョブの種類（例: "autopilot", "batch_prediction"）
            user_id: ジョブを開始したユーザーの ID
            task: 実行する非同期タスク
            metadata: ジョブに関連する追加情報
            on_progress: 進捗更新時のコールバック
            on_complete: ジョブ完了時のコールバック

        Returns:
            UUID: 作成されたジョブの ID
        """
        job_id = uuid4()
        now = datetime.utcnow()

        job_info = JobInfo(
            job_id=job_id,
            job_type=job_type,
            status=JobStatus.PENDING,
            user_id=user_id,
            created_at=now,
            updated_at=now,
            metadata=metadata or {},
        )

        async with self._lock:
            self._jobs[job_id] = job_info
            self._callbacks[job_id] = []
            if on_progress:
                self._callbacks[job_id].append(on_progress)
            if on_complete:
                self._callbacks[job_id].append(on_complete)

        # タスクをラップして実行
        wrapped_task = self._wrap_task(job_id, task)
        async_task = asyncio.create_task(wrapped_task)
        self._tasks[job_id] = async_task

        logger.info(f"Job created: {job_id} (type: {job_type})")
        return job_id

    async def _wrap_task(
        self, job_id: UUID, task: Coroutine[Any, Any, Any]
    ) -> None:
        """タスクをラップしてステータス管理を行う"""
        await self.update_job(job_id, status=JobStatus.RUNNING)

        try:
            result = await task
            await self.update_job(
                job_id,
                status=JobStatus.COMPLETED,
                progress=1.0,
                result=result,
                message="ジョブが正常に完了しました",
            )
        except asyncio.CancelledError:
            await self.update_job(
                job_id,
                status=JobStatus.CANCELLED,
                message="ジョブがキャンセルされました",
            )
        except Exception as e:
            logger.exception(f"Job {job_id} failed")
            await self.update_job(
                job_id,
                status=JobStatus.FAILED,
                error=str(e),
                message=f"エラーが発生しました: {e}",
            )

    async def update_job(
        self,
        job_id: UUID,
        status: Optional[JobStatus] = None,
        progress: Optional[float] = None,
        message: Optional[str] = None,
        result: Optional[Any] = None,
        error: Optional[str] = None,
    ) -> None:
        """
        ジョブの状態を更新し、コールバックを呼び出す

        Args:
            job_id: 更新するジョブの ID
            status: 新しいステータス
            progress: 進捗率 (0.0 ~ 1.0)
            message: 状態メッセージ
            result: 実行結果
            error: エラーメッセージ
        """
        async with self._lock:
            if job_id not in self._jobs:
                logger.warning(f"Job not found: {job_id}")
                return

            job = self._jobs[job_id]

            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = min(max(progress, 0.0), 1.0)
            if message is not None:
                job.message = message
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error

            job.updated_at = datetime.utcnow()

        # コールバック呼び出し（ロック外で実行）
        callbacks = self._callbacks.get(job_id, [])
        for callback in callbacks:
            try:
                await callback(job)
            except Exception:
                logger.exception(f"Callback failed for job {job_id}")

    def get_job(self, job_id: UUID) -> Optional[JobInfo]:
        """ジョブ情報を取得"""
        return self._jobs.get(job_id)

    def get_jobs_by_user(self, user_id: UUID) -> list[JobInfo]:
        """ユーザーのジョブ一覧を取得"""
        return [job for job in self._jobs.values() if job.user_id == user_id]

    def get_active_jobs(self) -> list[JobInfo]:
        """実行中のジョブ一覧を取得"""
        return [
            job
            for job in self._jobs.values()
            if job.status in (JobStatus.PENDING, JobStatus.RUNNING)
        ]

    async def cancel_job(self, job_id: UUID) -> bool:
        """
        ジョブをキャンセル

        Args:
            job_id: キャンセルするジョブの ID

        Returns:
            bool: キャンセルが成功したかどうか
        """
        if job_id not in self._tasks:
            return False

        task = self._tasks[job_id]
        if not task.done():
            task.cancel()
            logger.info(f"Job cancelled: {job_id}")
            return True

        return False

    async def cleanup_completed_jobs(self, max_age_hours: int = 24) -> int:
        """
        完了したジョブをクリーンアップ

        Args:
            max_age_hours: 保持する最大時間

        Returns:
            int: 削除されたジョブ数
        """
        now = datetime.utcnow()
        to_remove: list[UUID] = []

        async with self._lock:
            for job_id, job in self._jobs.items():
                if job.status in (
                    JobStatus.COMPLETED,
                    JobStatus.FAILED,
                    JobStatus.CANCELLED,
                ):
                    age_hours = (now - job.updated_at).total_seconds() / 3600
                    if age_hours > max_age_hours:
                        to_remove.append(job_id)

            for job_id in to_remove:
                del self._jobs[job_id]
                self._tasks.pop(job_id, None)
                self._callbacks.pop(job_id, None)

        logger.info(f"Cleaned up {len(to_remove)} completed jobs")
        return len(to_remove)

    async def shutdown(self) -> None:
        """マネージャーをシャットダウンし、実行中のジョブをキャンセル"""
        logger.info("Shutting down JobManager...")

        for job_id, task in self._tasks.items():
            if not task.done():
                task.cancel()
                logger.info(f"Cancelled job on shutdown: {job_id}")

        # すべてのタスクの完了を待機
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)

        logger.info("JobManager shutdown complete")
