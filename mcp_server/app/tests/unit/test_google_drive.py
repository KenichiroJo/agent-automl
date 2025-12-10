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
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from datarobot.auth.datarobot.exceptions import OAuthServiceClientErr

# Import user_config module first so we can patch it
import app.core.user_config

# Patch get_user_config before importing google_drive module
# This ensures the conditional functions are defined
_mock_config = MagicMock()
_mock_config.is_google_oauth_configured = True
_config_patcher = patch.object(
    app.core.user_config, "get_user_config", return_value=_mock_config
)
_config_patcher.start()

# Import the functions we need (after patching/reloading)
from app.tools.google_drive import (  # noqa: E402
    GoogleDriveClient,
    GoogleDriveFile,
    PaginatedResult,
    list_files_in_google_drive,
    read_google_drive_file,
    search_google_drive_files,
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


class TestSearchGoogleDriveFiles:
    """Tests for search_google_drive_files function."""

    @pytest.mark.asyncio
    async def test_successful_search_with_default_parameters(self, sample_files):
        """Test successful search with default parameters."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.return_value = sample_files

            result = await search_google_drive_files("test query")

            # Verify authentication and API calls
            mock_auth.assert_awaited_once_with("google")
            mock_search.assert_awaited_once_with("test query", 10)

            # Verify output format
            assert "ID: file1" in result
            assert "Name: doc1.pdf" in result
            assert "Type: application/pdf" in result
            assert "---" in result  # Separator between files

    @pytest.mark.asyncio
    async def test_search_with_custom_max_results(self, sample_files):
        """Test search with custom max_results parameter."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.return_value = sample_files

            result = await search_google_drive_files("test query", max_results=50)

            mock_search.assert_awaited_once_with("test query", 50)
            assert "ID: file1" in result

    @pytest.mark.asyncio
    async def test_search_max_results_capping(self, sample_files):
        """Test that max_results is capped at 100."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.return_value = sample_files

            await search_google_drive_files("test query", max_results=200)

            # Should be capped at 100
            mock_search.assert_awaited_once_with("test query", 100)

    @pytest.mark.asyncio
    async def test_search_empty_results(self):
        """Test search when no files are found."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.return_value = []

            result = await search_google_drive_files("nonexistent")

            assert result == "No files found matching query: nonexistent"

    @pytest.mark.asyncio
    async def test_search_input_validation(self):
        """Test input validation for max_results parameter."""
        result = await search_google_drive_files("test", max_results=0)
        assert result == "Error: max_results must be positive."

        result = await search_google_drive_files("test", max_results=-5)
        assert result == "Error: max_results must be positive."

    @pytest.mark.asyncio
    async def test_search_with_file_metadata(self, sample_files):
        """Test search result includes all file metadata fields."""
        # Create files with all metadata fields
        files_with_metadata = [
            GoogleDriveFile(
                id="file1",
                name="doc1.pdf",
                mime_type="application/pdf",
                size=1024,
                web_view_link="https://drive.google.com/file1",
                created_time="2024-01-01T00:00:00Z",
                modified_time="2024-01-02T00:00:00Z",
            )
        ]

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.return_value = files_with_metadata

            result = await search_google_drive_files("test query")

            assert "ID: file1" in result
            assert "Name: doc1.pdf" in result
            assert "Type: application/pdf" in result
            assert "Link: https://drive.google.com/file1" in result
            assert "Created: 2024-01-01T00:00:00Z" in result
            assert "Modified: 2024-01-02T00:00:00Z" in result

    @pytest.mark.asyncio
    async def test_search_error_handling(self):
        """Test error handling when search fails."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.side_effect = Exception("Search failed")

            result = await search_google_drive_files("test query")

            assert "Error searching Google Drive files" in result
            assert "Search failed" in result

    @pytest.mark.asyncio
    async def test_search_oauth_error(self):
        """Test OAuth error handling."""
        with patch(
            "app.tools.google_drive.get_access_token", new_callable=AsyncMock
        ) as mock_auth:
            mock_auth.side_effect = OAuthServiceClientErr("OAuth error")

            result = await search_google_drive_files("test query")

            assert "Could not obtain access token for Google" in result


class TestReadGoogleDriveFile:
    """Tests for read_google_drive_file function."""

    @pytest.mark.asyncio
    async def test_read_by_file_id_text_file(self):
        """Test reading a text file by file_id."""
        file_metadata = {
            "id": "file123",
            "name": "test.txt",
            "mimeType": "text/plain",
            "size": 100,
        }
        file_content = b"Hello, World!"

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
            patch.object(
                GoogleDriveClient, "download_file", new_callable=AsyncMock
            ) as mock_download,
        ):
            mock_auth.return_value = "test_access_token"
            mock_metadata.return_value = file_metadata
            mock_download.return_value = file_content

            result = await read_google_drive_file(file_id="file123")

            assert result == "Hello, World!"
            mock_metadata.assert_awaited_once_with("file123")
            mock_download.assert_awaited_once_with("file123")

    @pytest.mark.asyncio
    async def test_read_by_file_id_google_doc(self):
        """Test reading a Google Doc by file_id."""
        file_metadata = {
            "id": "doc123",
            "name": "test.doc",
            "mimeType": "application/vnd.google-apps.document",
            "size": 5000,
        }
        exported_content = b"Exported document content"

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
            patch.object(
                GoogleDriveClient, "export_file", new_callable=AsyncMock
            ) as mock_export,
        ):
            mock_auth.return_value = "test_access_token"
            mock_metadata.return_value = file_metadata
            mock_export.return_value = exported_content

            result = await read_google_drive_file(file_id="doc123")

            assert result == "Exported document content"
            mock_export.assert_awaited_once_with("doc123", "text/plain")

    @pytest.mark.asyncio
    async def test_read_by_file_id_google_sheet(self):
        """Test reading a Google Sheet by file_id returns appropriate message."""
        file_metadata = {
            "id": "sheet123",
            "name": "test.xlsx",
            "mimeType": "application/vnd.google-apps.spreadsheet",
            "size": 10000,
            "webViewLink": "https://drive.google.com/sheet123",
        }

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
        ):
            mock_auth.return_value = "test_access_token"
            mock_metadata.return_value = file_metadata

            result = await read_google_drive_file(file_id="sheet123")

            assert "MIME type 'application/vnd.google-apps.spreadsheet'" in result
            assert "not supported" in result
            assert "File ID: sheet123" in result
            assert "https://drive.google.com/sheet123" in result

    @pytest.mark.asyncio
    async def test_read_by_file_id_unsupported_type(self):
        """Test reading an unsupported file type."""
        file_metadata = {
            "id": "file123",
            "name": "test.pdf",
            "mimeType": "application/pdf",
            "size": 5000,
            "webViewLink": "https://drive.google.com/file123",
        }

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
        ):
            mock_auth.return_value = "test_access_token"
            mock_metadata.return_value = file_metadata

            result = await read_google_drive_file(file_id="file123")

            assert "MIME type 'application/pdf'" in result
            assert "not supported" in result
            assert "file123" in result
            assert "https://drive.google.com/file123" in result

    @pytest.mark.asyncio
    async def test_read_by_file_id_file_too_large(self):
        """Test reading a file that exceeds size limit."""
        file_metadata = {
            "id": "large_file",
            "name": "large.txt",
            "mimeType": "text/plain",
            "size": 15 * 1024 * 1024,  # 15 MB
            "webViewLink": "https://drive.google.com/large_file",
        }

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
        ):
            mock_auth.return_value = "test_access_token"
            mock_metadata.return_value = file_metadata

            result = await read_google_drive_file(file_id="large_file")

            assert "too large to read" in result
            assert "15.00 MB" in result
            assert "Maximum file size is 10 MB" in result

    @pytest.mark.asyncio
    async def test_read_by_file_name_single_exact_match(self):
        """Test reading by file_name with single exact match."""
        matching_file = GoogleDriveFile(
            id="file123",
            name="test.txt",
            mime_type="text/plain",
            size=100,
        )
        file_metadata = {
            "id": "file123",
            "name": "test.txt",
            "mimeType": "text/plain",
            "size": 100,
        }
        file_content = b"File content"

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
            patch.object(
                GoogleDriveClient, "download_file", new_callable=AsyncMock
            ) as mock_download,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.return_value = [matching_file]
            mock_metadata.return_value = file_metadata
            mock_download.return_value = file_content

            result = await read_google_drive_file(file_name="test.txt")

            # Should return options list, not auto-read
            assert "Found 1 file with the exact name" in result
            assert "File ID: file123" in result

    @pytest.mark.asyncio
    async def test_read_by_file_name_multiple_exact_matches(self):
        """Test reading by file_name with multiple exact matches."""
        matching_files = [
            GoogleDriveFile(
                id="file1",
                name="test.txt",
                mime_type="text/plain",
                size=100,
                modified_time="2024-01-01T00:00:00Z",
            ),
            GoogleDriveFile(
                id="file2",
                name="test.txt",
                mime_type="text/plain",
                size=200,
                modified_time="2024-01-02T00:00:00Z",
            ),
        ]

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.return_value = matching_files

            result = await read_google_drive_file(file_name="test.txt")

            assert "Found 2 files with the exact name" in result
            assert "File ID: file1" in result
            assert "File ID: file2" in result
            assert "Please use the 'file_id' parameter" in result

    @pytest.mark.asyncio
    async def test_read_by_file_name_no_exact_match_has_similar(self):
        """Test reading by file_name with no exact match but similar files."""
        similar_files = [
            GoogleDriveFile(
                id="file1",
                name="test_file.txt",
                mime_type="text/plain",
                size=100,
            ),
            GoogleDriveFile(
                id="file2",
                name="test_document.txt",
                mime_type="text/plain",
                size=200,
            ),
        ]

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            # First call returns empty (no exact match), second returns similar
            mock_search.side_effect = [[], similar_files]

            result = await read_google_drive_file(file_name="test.txt")

            assert "No exact match found" in result
            assert "found 2 similar file(s)" in result
            assert "Name: 'test_file.txt'" in result
            assert "Name: 'test_document.txt'" in result

    @pytest.mark.asyncio
    async def test_read_by_file_name_no_matches(self):
        """Test reading by file_name with no matches at all."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            # No exact match, then no similar matches
            mock_search.side_effect = [[], []]

            result = await read_google_drive_file(file_name="nonexistent.txt")

            assert "No files found with the name 'nonexistent.txt'" in result

    @pytest.mark.asyncio
    async def test_read_validation_error(self):
        """Test validation error when neither file_id nor file_name provided."""
        result = await read_google_drive_file()
        assert result == "Error: Either 'file_id' or 'file_name' must be provided."

    @pytest.mark.asyncio
    async def test_read_http_404_error(self):
        """Test HTTP 404 error handling."""
        import httpx

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
        ):
            mock_auth.return_value = "test_access_token"
            mock_response = MagicMock()
            mock_response.status_code = 404
            mock_response.text = "Not Found"
            mock_metadata.side_effect = httpx.HTTPStatusError(
                "Not Found", request=MagicMock(), response=mock_response
            )

            result = await read_google_drive_file(file_id="nonexistent")

            assert "File with ID 'nonexistent' not found" in result

    @pytest.mark.asyncio
    async def test_read_other_http_error(self):
        """Test other HTTP error handling."""
        import httpx

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
        ):
            mock_auth.return_value = "test_access_token"
            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_response.text = "Internal Server Error"
            mock_metadata.side_effect = httpx.HTTPStatusError(
                "Server Error", request=MagicMock(), response=mock_response
            )

            result = await read_google_drive_file(file_id="file123")

            assert "HTTP error reading Google Drive file" in result
            assert "500" in result

    @pytest.mark.asyncio
    async def test_read_generic_error_handling(self):
        """Test generic error handling."""
        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "get_file_metadata", new_callable=AsyncMock
            ) as mock_metadata,
        ):
            mock_auth.return_value = "test_access_token"
            mock_metadata.side_effect = Exception("Unexpected error")

            result = await read_google_drive_file(file_id="file123")

            assert "Error reading Google Drive file" in result
            assert "Unexpected error" in result

    @pytest.mark.asyncio
    async def test_read_oauth_error(self):
        """Test OAuth error handling."""
        with patch(
            "app.tools.google_drive.get_access_token", new_callable=AsyncMock
        ) as mock_auth:
            mock_auth.side_effect = OAuthServiceClientErr("OAuth error")

            result = await read_google_drive_file(file_id="file123")

            assert "Could not obtain access token for Google" in result

    @pytest.mark.asyncio
    async def test_read_similar_files_limit(self):
        """Test that similar files are limited to 10 results."""
        # Create 15 similar files
        similar_files = [
            GoogleDriveFile(
                id=f"file{i}",
                name=f"test_{i}.txt",
                mime_type="text/plain",
                size=100,
            )
            for i in range(15)
        ]

        with (
            patch(
                "app.tools.google_drive.get_access_token", new_callable=AsyncMock
            ) as mock_auth,
            patch.object(
                GoogleDriveClient, "search_files", new_callable=AsyncMock
            ) as mock_search,
        ):
            mock_auth.return_value = "test_access_token"
            mock_search.side_effect = [[], similar_files]

            result = await read_google_drive_file(file_name="test.txt")

            assert "found 15 similar file(s)" in result
            assert "... and 5 more file(s)" in result
            # Should only show first 10
            assert "file0" in result
            assert "file9" in result
