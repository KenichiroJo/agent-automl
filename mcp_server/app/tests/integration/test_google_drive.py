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

from typing import Any, AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import respx
from datarobot_genai.drmcp import integration_test_mcp_session
from httpx import Response
from mcp.types import CallToolResult, ListToolsResult, TextContent


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
        async with integration_test_mcp_session() as session:
            # 1. Test listing available tools
            tools_result: ListToolsResult = await session.list_tools()
            tool_names = [tool.name for tool in tools_result.tools]

            assert "list_files_in_google_drive" in tool_names

            # 2. Test listing files in Google Drive
            result: CallToolResult = await session.call_tool(
                "list_files_in_google_drive",
                {
                    "offset": 0,
                    "limit": 10,
                },
            )

            # 3. Validate the response
            assert not result.isError
            assert len(result.content) > 0
            assert isinstance(result.content[0], TextContent)

            result_text = result.content[0].text

            # 4. Verify the mocked data appears in the response
            assert "files" in result_text, f"Result text: {result_text}"
            for file_name in expected_file_names:
                assert file_name in result_text, (
                    f"Expected '{file_name}' in result: {result_text}"
                )

            # 5. Verify the mocks were called correctly
            assert mock_oauth_service.called, (
                "OAuth token retrieval should have been called"
            )
            mock_oauth_service.assert_called_once_with("google")

            assert mock_google_drive_api.called, (
                "Google Drive API should have been called"
            )
