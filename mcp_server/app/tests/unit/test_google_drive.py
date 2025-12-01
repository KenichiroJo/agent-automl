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
from unittest.mock import AsyncMock, patch

import pytest

from app.tools.google_drive import (
    GoogleDriveClient,
    GoogleDriveFile,
    PaginatedResult,
    list_files_in_google_drive,
)


@pytest.fixture
def sample_files():
    """Fixture providing a list of sample GoogleDriveFile objects."""
    return [
        GoogleDriveFile(
            id="file1", name="doc1.pdf", mime_type="application/pdf", size=1024
        ),
        GoogleDriveFile(
            id="file2",
            name="sheet1.xlsx",
            mime_type="application/vnd.ms-excel",
            size=2048,
        ),
        GoogleDriveFile(id="file3", name="image.png", mime_type="image/png", size=512),
    ]


class TestListFilesInGoogleDrive:
    """Tests for list_files_in_google_drive main entry point function."""

    @pytest.mark.asyncio
    async def test_successful_list_with_default_parameters(self, sample_files):
        """Test successful listing with default parameters and proper output format."""
        mock_result = PaginatedResult(files=sample_files, next_page_token=None)

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "list_files", new_callable=AsyncMock
            ) as mock_list,
        ):
            mock_auth.return_value = "test_access_token"
            mock_list.return_value = mock_result

            result = await list_files_in_google_drive()

            # Verify authentication and API calls
            mock_auth.assert_awaited_once_with("google")
            mock_list.assert_awaited_once_with(100, None)

            # Verify output format includes all file fields
            parsed = json.loads(result)
            assert parsed["count"] == 3
            assert parsed["offset"] == 0
            assert parsed["limit"] == 100
            assert len(parsed["data"]) == 3
            assert parsed["data"][0]["id"] == "file1"
            assert parsed["data"][0]["name"] == "doc1.pdf"
            assert parsed["data"][0]["mime_type"] == "application/pdf"
            assert parsed["data"][0]["size"] == 1024
            assert "note" not in parsed

    @pytest.mark.asyncio
    async def test_pagination_with_custom_offset_and_limit(self, sample_files):
        """Test pagination workflow with custom offset, limit, and has_more flag."""
        mock_list_result = PaginatedResult(
            files=sample_files[:2], next_page_token="next_token"
        )

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "skip_to_offset", new_callable=AsyncMock
            ) as mock_skip,
            patch.object(
                GoogleDriveClient, "list_files", new_callable=AsyncMock
            ) as mock_list,
        ):
            mock_auth.return_value = "test_access_token"
            mock_skip.return_value = ("page_token_after_skip", 0)
            mock_list.return_value = mock_list_result

            result = await list_files_in_google_drive(offset=10, limit=20)

            # Verify skip and list operations
            mock_skip.assert_awaited_once_with(10, 20)
            mock_list.assert_awaited_once_with(20, "page_token_after_skip")

            # Verify pagination note in output
            parsed = json.loads(result)
            assert parsed["offset"] == 10
            assert parsed["limit"] == 20
            assert parsed["count"] == 2
            assert "note" in parsed
            assert "offset=30" in parsed["note"]

    @pytest.mark.asyncio
    async def test_input_validation_errors(self):
        """Test input validation for offset and limit parameters."""
        # Negative offset
        result = await list_files_in_google_drive(offset=-5, limit=10)
        assert result == "Error: offset must be non-negative."

        # Zero limit
        result = await list_files_in_google_drive(offset=0, limit=0)
        assert result == "Error: limit must be positive."

        # Negative limit
        result = await list_files_in_google_drive(offset=0, limit=-10)
        assert result == "Error: limit must be positive."

    @pytest.mark.asyncio
    async def test_limit_capping_and_offset_boundary_conditions(self, sample_files):
        """Test that limit is capped at 1000 and offset exceeding files is handled."""
        mock_result = PaginatedResult(files=sample_files, next_page_token=None)

        # Test limit capping
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "list_files", new_callable=AsyncMock
            ) as mock_list,
        ):
            mock_auth.return_value = "test_access_token"
            mock_list.return_value = mock_result

            result = await list_files_in_google_drive(offset=0, limit=5000)
            mock_list.assert_awaited_once_with(1000, None)

            parsed = json.loads(result)
            assert parsed["limit"] == 1000

        # Test offset exceeding available files
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "skip_to_offset", new_callable=AsyncMock
            ) as mock_skip,
        ):
            mock_auth.return_value = "test_access_token"
            mock_skip.return_value = (None, 0)

            result = await list_files_in_google_drive(offset=1000, limit=10)
            assert result == "Offset exceeds the number of available files."

    @pytest.mark.asyncio
    async def test_empty_drive_handling(self):
        """Test proper message when Google Drive is empty."""
        empty_result = PaginatedResult(files=[], next_page_token=None)

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "list_files", new_callable=AsyncMock
            ) as mock_list,
        ):
            mock_auth.return_value = "test_access_token"
            mock_list.return_value = empty_result

            result = await list_files_in_google_drive()
            assert result == "No files found in Google Drive."

    @pytest.mark.asyncio
    async def test_api_error_handling(self):
        """Test error handling when Google Drive API fails."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "list_files", new_callable=AsyncMock
            ) as mock_list,
        ):
            mock_auth.return_value = "test_access_token"
            mock_list.side_effect = Exception("API Error: 403 Forbidden")

            result = await list_files_in_google_drive()
            assert "Error: An unexpected error occurred" in result
            assert "403 Forbidden" in result

    @pytest.mark.asyncio
    async def test_offset_within_first_page(self, sample_files):
        """Test that offset=50 with page_size=100 correctly returns files 50-99."""
        # Create 100 files, we want files 50-99
        all_files = [
            GoogleDriveFile(
                id=f"file{i}",
                name=f"doc{i}.pdf",
                mime_type="application/pdf",
                size=1024 + i,
            )
            for i in range(100)
        ]

        mock_result = PaginatedResult(
            files=all_files, next_page_token="token_for_next_100"
        )

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "skip_to_offset", new_callable=AsyncMock
            ) as mock_skip,
            patch.object(
                GoogleDriveClient, "list_files", new_callable=AsyncMock
            ) as mock_list,
        ):
            mock_auth.return_value = "test_access_token"
            # skip_to_offset should return (None, 50) because offset is in first page
            mock_skip.return_value = (None, 50)
            mock_list.return_value = mock_result

            result = await list_files_in_google_drive(offset=50, limit=100)

            # Verify skip_to_offset was called correctly
            mock_skip.assert_awaited_once_with(50, 100)

            # Verify list_files was called with None (first page)
            mock_list.assert_awaited_once_with(100, None)

            # Verify the result contains files starting from offset 50
            parsed = json.loads(result)
            assert parsed["offset"] == 50
            # We get files 50-99 (50 files total)
            assert parsed["count"] == 50
            assert parsed["data"][0]["id"] == "file50"
            assert parsed["data"][0]["name"] == "doc50.pdf"
