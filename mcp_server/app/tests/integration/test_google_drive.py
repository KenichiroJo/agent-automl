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
from typing import Any, AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import respx
from httpx import Response

from app.tools.google_drive import (
    list_files_in_google_drive,
    read_google_drive_file,
    search_google_drive_files,
)


@pytest.fixture
def mock_google_drive_response() -> dict[str, Any]:
    return {
        "files": [
            {
                "id": "1abc123",
                "name": "Test Document.pdf",
                "mimeType": "application/pdf",
                "size": "1024000",
            },
            {
                "id": "2def456",
                "name": "Spreadsheet.xlsx",
                "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "size": "2048000",
            },
            {
                "id": "3ghi789",
                "name": "Presentation.pptx",
                "mimeType": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "size": "4096000",
            },
        ],
        "nextPageToken": None,
    }


@pytest.fixture
def mock_oauth_token() -> str:
    return "test-access-token"


@pytest.fixture
def expected_file_names() -> list[str]:
    return ["Test Document.pdf", "Spreadsheet.xlsx", "Presentation.pptx"]


@pytest.fixture
async def mock_google_drive_api(
    mock_google_drive_response: dict[str, Any],
) -> AsyncGenerator[respx.Route, None]:
    """Mock the Google Drive API endpoint."""
    async with respx.mock:
        route = respx.get("https://www.googleapis.com/drive/v3/files").mock(
            return_value=Response(200, json=mock_google_drive_response)
        )
        yield route


@pytest.fixture
def mock_oauth_service(mock_oauth_token: str) -> AsyncGenerator[AsyncMock, None]:
    """Mock the DataRobot OAuth token retrieval."""
    with patch(
        "app.tools.google_drive.get_access_token", new_callable=AsyncMock
    ) as mock_get_token:
        mock_get_token.return_value = mock_oauth_token
        yield mock_get_token


@pytest.mark.asyncio
class TestGoogleDriveIntegration:
    """
    Integration tests for Google Drive MCP tools.

    These tests use mocking to avoid requiring actual external connectivity
    to Google Drive or DataRobot OAuth services.
    """

    async def test_list_files_in_google_drive(
        self,
        mock_google_drive_api: respx.Route,
        mock_oauth_service: AsyncMock,
        expected_file_names: list[str],
    ) -> None:
        result_text: str = await list_files_in_google_drive(offset=0, limit=10)
        result = json.loads(result_text)

        # Verify the response structure
        assert "files" in result or "data" in result, f"Result: {result_text}"

        # The result uses "data" key for the files list
        assert "data" in result
        assert result["count"] == 3
        assert result["offset"] == 0
        assert result["limit"] == 10
        assert len(result["data"]) == 3

        # Verify the mocked data appears in the response
        result_file_names = [file["name"] for file in result["data"]]
        for expected_name in expected_file_names:
            assert expected_name in result_file_names, (
                f"Expected '{expected_name}' in result: {result_file_names}"
            )

        # Verify the mocks were called correctly
        assert mock_oauth_service.called, (
            "OAuth token retrieval should have been called"
        )
        mock_oauth_service.assert_called_once_with("google")

        assert mock_google_drive_api.called, "Google Drive API should have been called"

    async def test_search_google_drive_files(
        self,
        mock_google_drive_api: respx.Route,
        mock_oauth_service: AsyncMock,
        expected_file_names: list[str],
    ) -> None:
        """Test searching for files in Google Drive."""
        result_text: str = await search_google_drive_files("Test", max_results=10)
        result_lines = result_text.split("\n---\n")

        # Verify we got results
        assert len(result_lines) > 0, "Should have search results"

        # Verify the mocked data appears in the response
        result_text_lower = result_text.lower()
        for expected_name in expected_file_names:
            assert expected_name.lower() in result_text_lower, (
                f"Expected '{expected_name}' in result: {result_text}"
            )

        # Verify the mocks were called correctly
        assert mock_oauth_service.called, (
            "OAuth token retrieval should have been called"
        )
        mock_oauth_service.assert_called_once_with("google")

        assert mock_google_drive_api.called, "Google Drive API should have been called"

    async def test_search_google_drive_files_with_query_operators(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test searching with Google Drive query operators."""
        search_response = {
            "files": [
                {
                    "id": "search123",
                    "name": "Report.pdf",
                    "mimeType": "application/pdf",
                    "size": "512000",
                    "webViewLink": "https://drive.google.com/search123",
                    "createdTime": "2024-01-01T00:00:00Z",
                    "modifiedTime": "2024-01-02T00:00:00Z",
                }
            ],
        }

        async with respx.mock:
            route = respx.get("https://www.googleapis.com/drive/v3/files").mock(
                return_value=Response(200, json=search_response)
            )

            result_text: str = await search_google_drive_files(
                "mimeType='application/pdf'", max_results=10
            )

            # Verify result contains expected information
            assert "ID: search123" in result_text
            assert "Name: Report.pdf" in result_text
            assert "Type: application/pdf" in result_text
            assert "Link: https://drive.google.com/search123" in result_text
            assert "Created: 2024-01-01T00:00:00Z" in result_text
            assert "Modified: 2024-01-02T00:00:00Z" in result_text

            # Verify API was called with correct query
            assert route.called
            request = route.calls.last.request
            assert "q" in request.url.params
            assert "mimeType='application/pdf'" in request.url.params["q"]

    async def test_search_google_drive_files_empty_results(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test search when no files match the query."""
        empty_response = {"files": []}

        async with respx.mock:
            respx.get("https://www.googleapis.com/drive/v3/files").mock(
                return_value=Response(200, json=empty_response)
            )

            result_text: str = await search_google_drive_files(
                "nonexistent", max_results=10
            )

            assert "No files found matching query: nonexistent" in result_text

    async def test_read_google_drive_file_by_id_text_file(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading a text file by file_id."""
        file_metadata = {
            "id": "text123",
            "name": "test.txt",
            "mimeType": "text/plain",
            "size": "100",
            "webViewLink": "https://drive.google.com/text123",
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        }
        file_content = b"Hello, World! This is test content."

        async with respx.mock:
            # Mock both endpoints with a callback that checks params
            def route_handler(request):
                if request.url.params.get("alt") == "media":
                    return Response(200, content=file_content)
                else:
                    return Response(200, json=file_metadata)

            route = respx.get("https://www.googleapis.com/drive/v3/files/text123").mock(
                side_effect=route_handler
            )

            result: str = await read_google_drive_file(file_id="text123")

            assert result == "Hello, World! This is test content."
            assert route.called
            # Verify it was called twice: once for metadata, once for download
            assert route.call_count == 2

    async def test_read_google_drive_file_by_id_google_doc(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading a Google Doc by file_id."""
        file_metadata = {
            "id": "doc123",
            "name": "test.doc",
            "mimeType": "application/vnd.google-apps.document",
            "size": "5000",
            "webViewLink": "https://drive.google.com/doc123",
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        }
        exported_content = b"Exported document content from Google Docs"

        async with respx.mock:
            # Mock metadata endpoint
            metadata_route = respx.get(
                "https://www.googleapis.com/drive/v3/files/doc123"
            ).mock(return_value=Response(200, json=file_metadata))

            # Mock export endpoint
            export_route = respx.get(
                "https://www.googleapis.com/drive/v3/files/doc123/export",
                params={"mimeType": "text/plain"},
            ).mock(return_value=Response(200, content=exported_content))

            result: str = await read_google_drive_file(file_id="doc123")

            assert result == "Exported document content from Google Docs"
            assert metadata_route.called
            assert export_route.called

    async def test_read_google_drive_file_by_id_google_sheet(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading a Google Sheet by file_id returns appropriate message."""
        file_metadata = {
            "id": "sheet123",
            "name": "test.xlsx",
            "mimeType": "application/vnd.google-apps.spreadsheet",
            "size": "10000",
            "webViewLink": "https://drive.google.com/sheet123",
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        }

        async with respx.mock:
            metadata_route = respx.get(
                "https://www.googleapis.com/drive/v3/files/sheet123"
            ).mock(return_value=Response(200, json=file_metadata))

            result: str = await read_google_drive_file(file_id="sheet123")

            assert "MIME type 'application/vnd.google-apps.spreadsheet'" in result
            assert "not supported" in result
            assert "File ID: sheet123" in result
            assert "https://drive.google.com/sheet123" in result
            assert metadata_route.called

    async def test_read_google_drive_file_by_id_unsupported_type(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading an unsupported file type."""
        file_metadata = {
            "id": "pdf123",
            "name": "test.pdf",
            "mimeType": "application/pdf",
            "size": "5000",
            "webViewLink": "https://drive.google.com/pdf123",
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        }

        async with respx.mock:
            metadata_route = respx.get(
                "https://www.googleapis.com/drive/v3/files/pdf123"
            ).mock(return_value=Response(200, json=file_metadata))

            result: str = await read_google_drive_file(file_id="pdf123")

            assert "MIME type 'application/pdf'" in result
            assert "not supported" in result
            assert "pdf123" in result
            assert "https://drive.google.com/pdf123" in result
            assert metadata_route.called

    async def test_read_google_drive_file_by_id_file_too_large(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading a file that exceeds size limit."""
        file_metadata = {
            "id": "large123",
            "name": "large.txt",
            "mimeType": "text/plain",
            "size": str(15 * 1024 * 1024),  # 15 MB
            "webViewLink": "https://drive.google.com/large123",
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        }

        async with respx.mock:
            metadata_route = respx.get(
                "https://www.googleapis.com/drive/v3/files/large123"
            ).mock(return_value=Response(200, json=file_metadata))

            result: str = await read_google_drive_file(file_id="large123")

            assert "too large to read" in result
            assert "15.00 MB" in result
            assert "Maximum file size is 10 MB" in result
            assert metadata_route.called

    async def test_read_google_drive_file_by_name_single_match(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading by file_name with single exact match."""
        search_response = {
            "files": [
                {
                    "id": "file123",
                    "name": "test.txt",
                    "mimeType": "text/plain",
                    "size": "100",
                    "webViewLink": "https://drive.google.com/file123",
                    "createdTime": "2024-01-01T00:00:00Z",
                    "modifiedTime": "2024-01-02T00:00:00Z",
                }
            ],
        }
        file_metadata = {
            "id": "file123",
            "name": "test.txt",
            "mimeType": "text/plain",
            "size": "100",
            "webViewLink": "https://drive.google.com/file123",
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        }
        file_content = b"File content from test.txt"

        async with respx.mock:
            # Mock search endpoint
            search_route = respx.get("https://www.googleapis.com/drive/v3/files").mock(
                return_value=Response(200, json=search_response)
            )

            # Mock metadata endpoint
            respx.get("https://www.googleapis.com/drive/v3/files/file123").mock(
                return_value=Response(200, json=file_metadata)
            )

            # Mock download endpoint
            respx.get(
                "https://www.googleapis.com/drive/v3/files/file123",
                params={"alt": "media"},
            ).mock(return_value=Response(200, content=file_content))

            result: str = await read_google_drive_file(file_name="test.txt")

            # Should return options list, not auto-read
            assert "Found 1 file with the exact name" in result
            assert "File ID: file123" in result
            assert search_route.called

    async def test_read_google_drive_file_by_name_multiple_matches(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading by file_name with multiple exact matches."""
        search_response = {
            "files": [
                {
                    "id": "file1",
                    "name": "test.txt",
                    "mimeType": "text/plain",
                    "size": "100",
                    "modifiedTime": "2024-01-01T00:00:00Z",
                },
                {
                    "id": "file2",
                    "name": "test.txt",
                    "mimeType": "text/plain",
                    "size": "200",
                    "modifiedTime": "2024-01-02T00:00:00Z",
                },
            ],
        }

        async with respx.mock:
            search_route = respx.get("https://www.googleapis.com/drive/v3/files").mock(
                return_value=Response(200, json=search_response)
            )

            result: str = await read_google_drive_file(file_name="test.txt")

            assert "Found 2 files with the exact name" in result
            assert "File ID: file1" in result
            assert "File ID: file2" in result
            assert "Please use the 'file_id' parameter" in result
            assert search_route.called

    async def test_read_google_drive_file_by_name_no_exact_match(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading by file_name with no exact match but similar files."""
        # First search returns empty (no exact match)
        # Second search returns similar files
        similar_response = {
            "files": [
                {
                    "id": "file1",
                    "name": "test_file.txt",
                    "mimeType": "text/plain",
                    "size": "100",
                    "modifiedTime": "2024-01-01T00:00:00Z",
                },
                {
                    "id": "file2",
                    "name": "test_document.txt",
                    "mimeType": "text/plain",
                    "size": "200",
                    "modifiedTime": "2024-01-02T00:00:00Z",
                },
            ],
        }

        async with respx.mock:
            # First call for exact match returns empty, second for similar returns results
            search_route = respx.get("https://www.googleapis.com/drive/v3/files").mock(
                side_effect=[
                    Response(200, json={"files": []}),  # No exact match
                    Response(200, json=similar_response),  # Similar files
                ]
            )

            result: str = await read_google_drive_file(file_name="test.txt")

            assert "No exact match found" in result
            assert "found 2 similar file(s)" in result
            assert "Name: 'test_file.txt'" in result
            assert "Name: 'test_document.txt'" in result
            assert search_route.called

    async def test_read_google_drive_file_by_name_no_matches(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test reading by file_name with no matches at all."""
        async with respx.mock:
            # Both searches return empty
            search_route = respx.get("https://www.googleapis.com/drive/v3/files").mock(
                side_effect=[
                    Response(200, json={"files": []}),  # No exact match
                    Response(200, json={"files": []}),  # No similar matches
                ]
            )

            result: str = await read_google_drive_file(file_name="nonexistent.txt")

            assert "No files found with the name 'nonexistent.txt'" in result
            assert search_route.called

    async def test_read_google_drive_file_validation_error(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test validation error when neither file_id nor file_name provided."""
        result: str = await read_google_drive_file()

        assert "Error: Either 'file_id' or 'file_name' must be provided." in result

    async def test_read_google_drive_file_http_404_error(
        self,
        mock_oauth_service: AsyncMock,
    ) -> None:
        """Test HTTP 404 error handling."""
        async with respx.mock:
            metadata_route = respx.get(
                "https://www.googleapis.com/drive/v3/files/nonexistent"
            ).mock(return_value=Response(404, text="Not Found"))

            result: str = await read_google_drive_file(file_id="nonexistent")

            assert "File with ID 'nonexistent' not found" in result
            assert metadata_route.called
