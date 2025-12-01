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
from dataclasses import asdict, dataclass
from typing import Any, Optional, Union

import httpx
from datarobot.auth.datarobot.exceptions import OAuthServiceClientErr
from datarobot_genai.drmcp import dr_mcp_tool
from datarobot_genai.drmcp.core.auth import get_access_token

logger = logging.getLogger(__name__)


PrimitiveData = Optional[Union[str, int, float, bool]]


@dataclass
class GoogleDriveFile:
    """Represents a file from Google Drive."""

    id: str
    name: str
    mime_type: str
    size: Optional[int] = None

    @classmethod
    def from_api_response(cls, data: dict[str, Any]) -> "GoogleDriveFile":
        """Create a GoogleDriveFile from API response data."""
        return cls(
            id=data.get("id", "Unknown"),
            name=data.get("name", "Unknown"),
            mime_type=data.get("mimeType", "Unknown"),
            size=int(data["size"]) if data.get("size") else None,
        )


@dataclass
class PaginatedResult:
    """Result of a paginated API call."""

    files: list[GoogleDriveFile]
    next_page_token: Optional[str] = None

    def is_empty(self) -> bool:
        return len(self.files) == 0


class GoogleDriveClient:
    """Client for interacting with Google Drive API."""

    API_URL = "https://www.googleapis.com/drive/v3/files"
    DEFAULT_FIELDS = "nextPageToken, files(id, name, size, mimeType)"
    DEFAULT_ORDER = "modifiedTime desc"

    def __init__(self, access_token: str):
        self.headers = {"Authorization": f"Bearer {access_token}"}

    async def list_files(
        self,
        page_size: int,
        page_token: Optional[str] = None,
    ) -> PaginatedResult:
        """Fetch a page of files from Google Drive."""
        params: dict[str, PrimitiveData] = {
            "pageSize": page_size,
            "fields": self.DEFAULT_FIELDS,
            "orderBy": self.DEFAULT_ORDER,
        }
        if page_token:
            params["pageToken"] = page_token

        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.API_URL,
                headers=self.headers,
                params=params,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            files = [
                GoogleDriveFile.from_api_response(file_data)
                for file_data in data.get("files", [])
            ]
            return PaginatedResult(
                files=files,
                next_page_token=data.get("nextPageToken"),
            )

    async def skip_to_offset(
        self, offset: int, page_size: int
    ) -> tuple[Optional[str], int]:
        """Skip pages until reaching the desired offset.

        Returns:
            A tuple of (page_token, skip_count) where:
            - page_token: The token for the page containing the offset (None for first page)
            - skip_count: Number of items to skip within that page

        Returns (None, 0) if offset exceeds available files.
        """
        if offset == 0:
            return (None, 0)

        current_offset = 0
        page_token: Optional[str] = None

        while True:
            result = await self.list_files(page_size, page_token)
            if result.is_empty():
                # No files in this page, offset exceeds available files
                return (None, 0)

            files_in_page = len(result.files)

            # Check if the offset falls within this page
            if current_offset + files_in_page > offset:
                skip_in_page = offset - current_offset
                return (page_token, skip_in_page)

            # Move to next page
            current_offset += files_in_page

            if not result.next_page_token:
                # No more pages available, offset exceeds available files
                return (None, 0)

            page_token = result.next_page_token


def format_file_list(
    files: list[GoogleDriveFile],
    offset: int,
    limit: int,
    has_more: bool,
) -> str:
    """Format a list of files for display."""
    if not files:
        return "No files found in Google Drive."

    result = {
        "count": len(files),
        "data": [asdict(file) for _, file in enumerate(files, start=offset + 1)],
        "offset": offset,
        "limit": limit,
    }

    if has_more:
        result["note"] = (
            f"More files available. Use offset={offset + limit} to fetch the next page."
        )

    return json.dumps(result, indent=2)


@dr_mcp_tool(tags={"google-drive", "data"})
async def list_files_in_google_drive(offset: int = 0, limit: int = 100) -> str:
    """
    A tool to list files in users' Google Drive with pagination support.

    Args:
        offset: The starting position for listing files (default: 0)
        limit: Maximum number of files to return (default: 100, max: 1000)

    Returns:
        A formatted string containing the list of files with their metadata
    """
    if offset < 0:
        return "Error: offset must be non-negative."
    if limit <= 0:
        return "Error: limit must be positive."

    try:
        access_token = await get_access_token("google")
    except OAuthServiceClientErr as e:
        logger.error(f"OAuth client error: {e}")
        return (
            "Could not obtain access token for Google. Make sure the OAuth "
            "permission was granted for the application to act on your behalf."
        )
    except Exception as e:
        logger.error(f"Unexpected error obtaining access token: {e}")
        return "An unexpected error occurred while obtaining access token for Google."

    limit = min(limit, 1000)
    try:
        client = GoogleDriveClient(access_token)

        page_token, skip_in_page = await client.skip_to_offset(offset, limit)
        if page_token is None and skip_in_page == 0 and offset > 0:
            return "Offset exceeds the number of available files."

        result = await client.list_files(limit, page_token)

        # Skip items within the page to reach the exact offset
        files_to_return = result.files[skip_in_page:]

        return format_file_list(
            files=files_to_return,
            offset=offset,
            limit=limit,
            has_more=result.next_page_token is not None,
        )

    except Exception as e:
        logger.error(f"Unexpected error occurred while listing Google Drive files: {e}")
        return f"Error: An unexpected error occurred. {str(e)}"
