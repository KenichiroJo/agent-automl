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
Jobs API Router

バックグラウンドジョブの管理 API エンドポイント。
ジョブの作成、状態確認、キャンセルを提供。
"""
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.auth.ctx import must_get_auth_ctx
from app.jobs.manager import JobInfo, JobStatus

from datarobot.auth.session import AuthCtx
from datarobot.auth.typing import Metadata

logger = logging.getLogger(__name__)
jobs_router = APIRouter(tags=["Jobs"])


# ─────────────────────────────────────────────────────────────
# Response/Request Models
# ─────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    """ジョブ情報レスポンス"""
    job_id: UUID
    job_type: str
    status: JobStatus
    progress: float
    message: str
    created_at: datetime
    updated_at: datetime
    error: Optional[str] = None

    @classmethod
    def from_job_info(cls, job: JobInfo) -> "JobResponse":
        return cls(
            job_id=job.job_id,
            job_type=job.job_type,
            status=job.status,
            progress=job.progress,
            message=job.message,
            created_at=job.created_at,
            updated_at=job.updated_at,
            error=job.error,
        )


class CreateAutoPilotMonitorRequest(BaseModel):
    """AutoPilot 監視ジョブ作成リクエスト"""
    project_id: str


class CreateAutoPilotMonitorResponse(BaseModel):
    """AutoPilot 監視ジョブ作成レスポンス"""
    job_id: UUID
    message: str


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@jobs_router.get("/jobs")
async def list_jobs(
    request: Request,
    auth_ctx: AuthCtx[Metadata] = Depends(must_get_auth_ctx),
) -> list[JobResponse]:
    """
    現在のユーザーのジョブ一覧を取得

    Returns:
        list[JobResponse]: ジョブ情報のリスト
    """
    job_manager = request.app.state.deps.job_manager
    user_id = UUID(auth_ctx.user.id)

    jobs = job_manager.get_jobs_by_user(user_id)

    return [JobResponse.from_job_info(job) for job in jobs]


@jobs_router.get("/jobs/{job_id}")
async def get_job(
    request: Request,
    job_id: UUID,
    auth_ctx: AuthCtx[Metadata] = Depends(must_get_auth_ctx),
) -> JobResponse:
    """
    特定のジョブ情報を取得

    Args:
        job_id: ジョブ ID

    Returns:
        JobResponse: ジョブ情報
    """
    job_manager = request.app.state.deps.job_manager
    user_id = UUID(auth_ctx.user.id)

    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # 自分のジョブのみアクセス可能
    if job.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return JobResponse.from_job_info(job)


@jobs_router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    request: Request,
    job_id: UUID,
    auth_ctx: AuthCtx[Metadata] = Depends(must_get_auth_ctx),
) -> JobResponse:
    """
    ジョブをキャンセル

    Args:
        job_id: キャンセルするジョブ ID

    Returns:
        JobResponse: 更新されたジョブ情報
    """
    job_manager = request.app.state.deps.job_manager
    user_id = UUID(auth_ctx.user.id)

    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    if job.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    if job.status not in (JobStatus.PENDING, JobStatus.RUNNING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job with status: {job.status}",
        )

    cancelled = await job_manager.cancel_job(job_id)

    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel job",
        )

    # 更新後のジョブを取得
    updated_job = job_manager.get_job(job_id)
    if not updated_job:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Job not found after cancellation",
        )

    return JobResponse.from_job_info(updated_job)


@jobs_router.post("/jobs/autopilot-monitor")
async def create_autopilot_monitor(
    request: Request,
    body: CreateAutoPilotMonitorRequest,
    auth_ctx: AuthCtx[Metadata] = Depends(must_get_auth_ctx),
) -> CreateAutoPilotMonitorResponse:
    """
    AutoPilot 進捗監視ジョブを作成

    DataRobot プロジェクトの AutoPilot 実行状況を監視し、
    進捗をリアルタイムで追跡します。

    Args:
        body: プロジェクト ID を含むリクエスト

    Returns:
        CreateAutoPilotMonitorResponse: 作成されたジョブの情報
    """
    from app.jobs.autopilot import AutoPilotMonitor

    deps = request.app.state.deps
    job_manager = deps.job_manager
    config = deps.config
    user_id = UUID(auth_ctx.user.id)

    # API トークンを取得（auth_ctx から）
    api_token = auth_ctx.api_key if hasattr(auth_ctx, "api_key") else None
    if not api_token:
        # フォールバック: 設定から取得
        api_token = config.datarobot_api_token

    if not api_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API token not available",
        )

    # 監視タスクを作成
    async def monitor_task() -> dict:
        monitor = AutoPilotMonitor(
            api_token=api_token,
            endpoint=config.datarobot_endpoint,
        )
        try:
            # 注意: job_id は create_job 後に取得するため、
            # ここでは簡易版の監視を実行
            import asyncio

            while True:
                progress = await monitor.get_progress(body.project_id)

                if progress.stage.value in ("completed", "failed"):
                    return {
                        "project_id": body.project_id,
                        "status": progress.stage.value,
                        "models_completed": progress.models_completed,
                    }

                await asyncio.sleep(10)
        finally:
            await monitor.close()

    job_id = await job_manager.create_job(
        job_type="autopilot_monitor",
        user_id=user_id,
        task=monitor_task(),
        metadata={"project_id": body.project_id},
    )

    logger.info(f"Created AutoPilot monitor job: {job_id} for project: {body.project_id}")

    return CreateAutoPilotMonitorResponse(
        job_id=job_id,
        message=f"AutoPilot monitoring started for project: {body.project_id}",
    )


@jobs_router.get("/jobs/active")
async def list_active_jobs(
    request: Request,
    auth_ctx: AuthCtx[Metadata] = Depends(must_get_auth_ctx),
) -> list[JobResponse]:
    """
    実行中のジョブ一覧を取得

    Returns:
        list[JobResponse]: 実行中のジョブ情報リスト
    """
    job_manager = request.app.state.deps.job_manager
    user_id = UUID(auth_ctx.user.id)

    # すべてのアクティブジョブを取得し、自分のジョブのみフィルタ
    all_active = job_manager.get_active_jobs()
    user_jobs = [job for job in all_active if job.user_id == user_id]

    return [JobResponse.from_job_info(job) for job in user_jobs]
