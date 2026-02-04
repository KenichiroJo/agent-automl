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
JobManager Unit Tests

バックグラウンドジョブマネージャーのユニットテスト。
"""
import asyncio
from datetime import datetime
from uuid import uuid4

import pytest

from app.jobs.manager import JobInfo, JobManager, JobStatus


class TestJobManager:
    """JobManager のテストクラス"""

    @pytest.fixture
    def job_manager(self) -> JobManager:
        """テスト用 JobManager インスタンス"""
        return JobManager()

    @pytest.fixture
    def user_id(self):
        """テスト用ユーザー ID"""
        return uuid4()

    # ─────────────────────────────────────────────────────────────
    # create_job テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_create_job_returns_uuid(
        self, job_manager: JobManager, user_id
    ):
        """ジョブ作成時に UUID が返されることを確認"""

        async def dummy_task():
            return "completed"

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=dummy_task(),
        )

        assert job_id is not None
        assert isinstance(job_id, type(uuid4()))

    @pytest.mark.asyncio
    async def test_create_job_stores_job_info(
        self, job_manager: JobManager, user_id
    ):
        """ジョブ情報が正しく保存されることを確認"""

        async def dummy_task():
            await asyncio.sleep(0.1)
            return "done"

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=dummy_task(),
            metadata={"key": "value"},
        )

        job = job_manager.get_job(job_id)

        assert job is not None
        assert job.job_type == "test_job"
        assert job.user_id == user_id
        assert job.metadata == {"key": "value"}

    @pytest.mark.asyncio
    async def test_create_job_with_callbacks(
        self, job_manager: JobManager, user_id
    ):
        """コールバックが呼び出されることを確認"""
        callback_called = []

        async def on_progress(job: JobInfo):
            callback_called.append(job.status)

        async def quick_task():
            return "done"

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=quick_task(),
            on_progress=on_progress,
        )

        # タスク完了を待つ
        await asyncio.sleep(0.2)

        # RUNNING と COMPLETED が呼ばれるはず
        assert JobStatus.RUNNING in callback_called
        assert JobStatus.COMPLETED in callback_called

    # ─────────────────────────────────────────────────────────────
    # get_job テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_get_job_returns_none_for_unknown_id(
        self, job_manager: JobManager
    ):
        """存在しないジョブ ID で None が返ることを確認"""
        result = job_manager.get_job(uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_get_job_returns_correct_job(
        self, job_manager: JobManager, user_id
    ):
        """正しいジョブ情報が返されることを確認"""

        async def dummy_task():
            await asyncio.sleep(0.5)
            return "done"

        job_id = await job_manager.create_job(
            job_type="unique_type",
            user_id=user_id,
            task=dummy_task(),
        )

        job = job_manager.get_job(job_id)

        assert job is not None
        assert job.job_id == job_id
        assert job.job_type == "unique_type"

    # ─────────────────────────────────────────────────────────────
    # update_job テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_update_job_changes_progress(
        self, job_manager: JobManager, user_id
    ):
        """進捗更新が反映されることを確認"""

        async def long_task():
            await asyncio.sleep(10)
            return "done"

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=long_task(),
        )

        await job_manager.update_job(job_id, progress=0.5, message="halfway")

        job = job_manager.get_job(job_id)

        assert job is not None
        assert job.progress == 0.5
        assert job.message == "halfway"

        # クリーンアップ
        await job_manager.cancel_job(job_id)

    @pytest.mark.asyncio
    async def test_update_job_clamps_progress(
        self, job_manager: JobManager, user_id
    ):
        """進捗が 0.0 ~ 1.0 の範囲に制限されることを確認"""

        async def long_task():
            await asyncio.sleep(10)
            return "done"

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=long_task(),
        )

        # 範囲外の値を設定
        await job_manager.update_job(job_id, progress=1.5)
        job = job_manager.get_job(job_id)
        assert job is not None
        assert job.progress == 1.0

        await job_manager.update_job(job_id, progress=-0.5)
        job = job_manager.get_job(job_id)
        assert job is not None
        assert job.progress == 0.0

        # クリーンアップ
        await job_manager.cancel_job(job_id)

    # ─────────────────────────────────────────────────────────────
    # cancel_job テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_cancel_job_stops_running_task(
        self, job_manager: JobManager, user_id
    ):
        """実行中のタスクがキャンセルされることを確認"""
        task_completed = []

        async def long_task():
            try:
                await asyncio.sleep(10)
                task_completed.append(True)
                return "done"
            except asyncio.CancelledError:
                task_completed.append(False)
                raise

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=long_task(),
        )

        # タスクが開始するのを待つ
        await asyncio.sleep(0.1)

        result = await job_manager.cancel_job(job_id)
        assert result is True

        # キャンセル処理を待つ
        await asyncio.sleep(0.2)

        job = job_manager.get_job(job_id)
        assert job is not None
        assert job.status == JobStatus.CANCELLED
        assert False in task_completed  # タスクはキャンセルされた

    @pytest.mark.asyncio
    async def test_cancel_job_returns_false_for_unknown_id(
        self, job_manager: JobManager
    ):
        """存在しないジョブ ID でキャンセルが失敗することを確認"""
        result = await job_manager.cancel_job(uuid4())
        assert result is False

    # ─────────────────────────────────────────────────────────────
    # get_jobs_by_user テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_get_jobs_by_user_filters_correctly(
        self, job_manager: JobManager
    ):
        """ユーザーごとにジョブがフィルタリングされることを確認"""
        user1 = uuid4()
        user2 = uuid4()

        async def dummy_task():
            await asyncio.sleep(1)
            return "done"

        await job_manager.create_job(
            job_type="job1", user_id=user1, task=dummy_task()
        )
        await job_manager.create_job(
            job_type="job2", user_id=user1, task=dummy_task()
        )
        await job_manager.create_job(
            job_type="job3", user_id=user2, task=dummy_task()
        )

        user1_jobs = job_manager.get_jobs_by_user(user1)
        user2_jobs = job_manager.get_jobs_by_user(user2)

        assert len(user1_jobs) == 2
        assert len(user2_jobs) == 1
        assert all(job.user_id == user1 for job in user1_jobs)
        assert all(job.user_id == user2 for job in user2_jobs)

        # クリーンアップ
        await job_manager.shutdown()

    # ─────────────────────────────────────────────────────────────
    # get_active_jobs テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_get_active_jobs_returns_running_jobs(
        self, job_manager: JobManager, user_id
    ):
        """実行中のジョブのみが返されることを確認"""

        async def long_task():
            await asyncio.sleep(5)
            return "done"

        async def quick_task():
            return "done"

        # 長いタスク（実行中のまま）
        await job_manager.create_job(
            job_type="long", user_id=user_id, task=long_task()
        )

        # 短いタスク（すぐ完了）
        await job_manager.create_job(
            job_type="quick", user_id=user_id, task=quick_task()
        )

        # 短いタスクが完了するのを待つ
        await asyncio.sleep(0.2)

        active_jobs = job_manager.get_active_jobs()

        # 長いタスクのみがアクティブ
        assert len(active_jobs) == 1
        assert active_jobs[0].job_type == "long"

        # クリーンアップ
        await job_manager.shutdown()

    # ─────────────────────────────────────────────────────────────
    # タスク完了テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_job_completes_successfully(
        self, job_manager: JobManager, user_id
    ):
        """タスクが正常に完了することを確認"""

        async def successful_task():
            await asyncio.sleep(0.1)
            return {"result": "success"}

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=successful_task(),
        )

        # タスク完了を待つ
        await asyncio.sleep(0.3)

        job = job_manager.get_job(job_id)

        assert job is not None
        assert job.status == JobStatus.COMPLETED
        assert job.progress == 1.0
        assert job.result == {"result": "success"}

    @pytest.mark.asyncio
    async def test_job_handles_failure(
        self, job_manager: JobManager, user_id
    ):
        """タスク失敗時にエラーが記録されることを確認"""

        async def failing_task():
            await asyncio.sleep(0.1)
            raise ValueError("Something went wrong")

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=failing_task(),
        )

        # タスク完了を待つ
        await asyncio.sleep(0.3)

        job = job_manager.get_job(job_id)

        assert job is not None
        assert job.status == JobStatus.FAILED
        assert "Something went wrong" in (job.error or "")

    # ─────────────────────────────────────────────────────────────
    # cleanup_completed_jobs テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_cleanup_removes_old_jobs(
        self, job_manager: JobManager, user_id
    ):
        """古い完了済みジョブが削除されることを確認"""

        async def quick_task():
            return "done"

        job_id = await job_manager.create_job(
            job_type="test_job",
            user_id=user_id,
            task=quick_task(),
        )

        # タスク完了を待つ
        await asyncio.sleep(0.2)

        # 0時間でクリーンアップ（すべての完了ジョブを削除）
        removed = await job_manager.cleanup_completed_jobs(max_age_hours=0)

        assert removed == 1
        assert job_manager.get_job(job_id) is None

    # ─────────────────────────────────────────────────────────────
    # shutdown テスト
    # ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_shutdown_cancels_all_jobs(
        self, job_manager: JobManager, user_id
    ):
        """シャットダウン時にすべてのジョブがキャンセルされることを確認"""

        async def long_task():
            await asyncio.sleep(10)
            return "done"

        job_id1 = await job_manager.create_job(
            job_type="job1", user_id=user_id, task=long_task()
        )
        job_id2 = await job_manager.create_job(
            job_type="job2", user_id=user_id, task=long_task()
        )

        # タスクが開始するのを待つ
        await asyncio.sleep(0.1)

        await job_manager.shutdown()

        job1 = job_manager.get_job(job_id1)
        job2 = job_manager.get_job(job_id2)

        assert job1 is not None
        assert job2 is not None
        assert job1.status == JobStatus.CANCELLED
        assert job2.status == JobStatus.CANCELLED
