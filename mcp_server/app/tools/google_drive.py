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
from typing import Any, Optional, Union, cast

import httpx
from datarobot.auth.datarobot.exceptions import OAuthServiceClientErr
from datarobot_genai.drmcp import dr_mcp_tool
from datarobot_genai.drmcp.core.auth import get_access_token

from app.core.user_config import get_user_config

logger = logging.getLogger(__name__)


PrimitiveData = Optional[Union[str, int, float, bool]]


@dataclass
class GoogleDriveFile:
    """Represents a file from Google Drive."""

    id: str
    name: str
    mime_type: str
    size: Optional[int] = None
    web_view_link: Optional[str] = None
    created_time: Optional[str] = None
    modified_time: Optional[str] = None

    @classmethod
    def from_api_response(cls, data: dict[str, Any]) -> "GoogleDriveFile":
        """Create a GoogleDriveFile from API response data."""
        return cls(
            id=data.get("id", "Unknown"),
            name=data.get("name", "Unknown"),
            mime_type=data.get("mimeType", "Unknown"),
            size=int(data["size"]) if data.get("size") else None,
            web_view_link=data.get("webViewLink"),
            created_time=data.get("createdTime"),
            modified_time=data.get("modifiedTime"),
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
    DEFAULT_FIELDS = "nextPageToken,files(id,name,size,mimeType)"
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

    async def search_files(
        self,
        query: str,
        max_results: int,
    ) -> list[GoogleDriveFile]:
        """Search for files in Google Drive using a query string.

        Args:
            query: Search query string (e.g., "name contains 'report'", "mimeType='application/pdf'").
                If the query doesn't contain operators (contains, =, etc.), it will be treated as
                a name search: "name contains '{query}'".
            max_results: Maximum number of results to return.

        Returns:
            A list of GoogleDriveFile objects matching the query.
        """
        # If query doesn't look like a formatted query (no operators), format it as a name search
        # Check if query already has Google Drive API operators
        has_operator = any(
            op in query
            for op in [" contains ", "=", "!=", " in ", " and ", " or ", " not "]
        )
        formatted_query = query
        if not has_operator and query.strip():
            # Simple text search - format as name contains query
            # Escape backslashes first, then single quotes for Google Drive API
            escaped_query = query.replace("\\", "\\\\").replace("'", "\\'")
            formatted_query = f"name contains '{escaped_query}'"
            logger.debug(f"Auto-formatted query '{query}' to '{formatted_query}'")

        params: dict[str, PrimitiveData] = {
            "q": formatted_query,
            "pageSize": min(max_results, 100),
            "fields": "files(id,name,size,mimeType,webViewLink,createdTime,modifiedTime)",
        }

        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.API_URL,
                headers=self.headers,
                params=params,
                timeout=30.0,
            )
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 400:
                    error_detail = e.response.text
                    logger.error(
                        f"Google Drive API 400 error. Query: {formatted_query}, Response: {error_detail}"
                    )
                    raise ValueError(
                        f"Invalid search query format. "
                        f"Query was: '{query}'. "
                        f"Formatted as: '{formatted_query}'. "
                        f"API error: {error_detail}. "
                        f"Use proper Google Drive query syntax (e.g., \"name contains 'text'\", \"mimeType='application/pdf'\")."
                    ) from e
                raise
            data = response.json()

            files = [
                GoogleDriveFile.from_api_response(file_data)
                for file_data in data.get("files", [])
            ]
            return files

    async def get_file_metadata(self, file_id: str) -> dict[str, Any]:
        """Get metadata for a specific file.

        Args:
            file_id: The ID of the file.

        Returns:
            A dictionary containing file metadata.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.API_URL}/{file_id}",
                headers=self.headers,
                params={
                    "fields": "id,name,size,mimeType,webViewLink,createdTime,modifiedTime"
                },
                timeout=30.0,
            )
            response.raise_for_status()
            return cast(dict[str, Any], response.json())

    async def download_file(self, file_id: str) -> bytes:
        """Download a file's content.

        Args:
            file_id: The ID of the file to download.

        Returns:
            The file content as bytes.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.API_URL}/{file_id}",
                headers=self.headers,
                params={"alt": "media"},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.content

    async def export_file(self, file_id: str, mime_type: str) -> bytes:
        """Export a Google Workspace file (Docs, Sheets, etc.) in a different format.

        Args:
            file_id: The ID of the file to export.
            mime_type: The MIME type to export as (e.g., "text/plain").

        Returns:
            The exported file content as bytes.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.API_URL}/{file_id}/export",
                headers=self.headers,
                params={"mimeType": mime_type},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.content


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


# Only register Google Drive tools if Google provider is configured
if get_user_config().is_google_oauth_configured:

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
            return (
                "An unexpected error occurred while obtaining access token for Google."
            )

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
            logger.error(
                f"Unexpected error occurred while listing Google Drive files: {e}"
            )
            return f"Error: An unexpected error occurred. {str(e)}"

    @dr_mcp_tool(tags={"google-drive", "files", "search"})
    async def search_google_drive_files(query: str, max_results: int = 10) -> str:
        """
        Search for files in Google Drive.

        Args:
            query: Search query string (e.g., "name contains 'report'", "mimeType='application/pdf'").
                See Google Drive API query syntax for more options.
            max_results: Maximum number of results to return (default: 10, max: 100).

        Returns:
            A string containing file information including ID, name, MIME type, and web view link.
        """
        if max_results <= 0:
            return "Error: max_results must be positive."

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
            return (
                "An unexpected error occurred while obtaining access token for Google."
            )

        max_results = min(max_results, 100)
        try:
            client = GoogleDriveClient(access_token)
            files = await client.search_files(query, max_results)

            if not files:
                return f"No files found matching query: {query}"

            result_lines = []
            for file in files:
                file_info = (
                    f"ID: {file.id}\n"
                    f"  Name: {file.name}\n"
                    f"  Type: {file.mime_type}\n"
                    f"  Link: {file.web_view_link or 'N/A'}\n"
                    f"  Created: {file.created_time or 'N/A'}\n"
                    f"  Modified: {file.modified_time or 'N/A'}\n"
                )
                result_lines.append(file_info)

            logger.info(f"Found {len(files)} files matching query: {query}")
            return "\n---\n".join(result_lines)

        except Exception as e:
            error_msg = f"Error searching Google Drive files: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return error_msg

    async def _read_file_by_id(client: GoogleDriveClient, file_id: str) -> str:
        """Helper function to read a file by its ID.

        Args:
            client: GoogleDriveClient instance.
            file_id: The ID of the file to read.

        Returns:
            The file contents as a string or a message about the file type.
        """
        # Maximum file size to read (10 MB)
        MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB in bytes

        # Get file metadata
        file_metadata = await client.get_file_metadata(file_id)
        mime_type = file_metadata.get("mimeType", "")
        file_name = file_metadata.get("name", "Unknown")
        file_size_raw = file_metadata.get("size")

        # Convert file size to integer if it's a string
        file_size = None
        if file_size_raw is not None:
            try:
                file_size = (
                    int(file_size_raw)
                    if isinstance(file_size_raw, str)
                    else file_size_raw
                )
            except (ValueError, TypeError):
                file_size = None

        # Check file size if available
        if file_size and file_size > MAX_FILE_SIZE:
            size_mb = file_size / (1024 * 1024)
            return (
                f"File '{file_name}' is too large to read ({size_mb:.2f} MB). "
                f"Maximum file size is {MAX_FILE_SIZE / (1024 * 1024):.0f} MB. "
                f"File ID: {file_id}, Web View Link: {file_metadata.get('webViewLink', 'N/A')}"
            )

        # Handle different file types
        if mime_type.startswith("text/"):
            # For text files, download and return content
            file_content = await client.download_file(file_id)
            return file_content.decode("utf-8")
        elif mime_type == "application/vnd.google-apps.document":
            # Google Docs - export as plain text
            file_content = await client.export_file(file_id, "text/plain")
            return file_content.decode("utf-8")
        else:
            web_view_link = file_metadata.get("webViewLink", "N/A")
            return (
                f"File '{file_name}' has MIME type '{mime_type}'. "
                "Direct content reading is not supported for this file type. "
                f"File ID: {file_id}, Web View Link: {web_view_link}"
            )

    @dr_mcp_tool(tags={"google-drive", "files", "read"})
    async def read_google_drive_file(
        *, file_id: Optional[str] = None, file_name: Optional[str] = None
    ) -> str:
        """
        Read the contents of a file from Google Drive.

        Args:
            file_id: The ID of the file to read from Google Drive. Either file_id or file_name must be provided.
            file_name: The name of the file to read. If provided, the function will search for files with this name.
                If multiple files match, a list of options will be returned. If a single exact match is found,
                that file will be read automatically.

        Returns:
            The file contents as a string. For text files, returns the text content.
            For other file types, returns a message indicating the file type.
            If multiple files match the file_name, returns a formatted list of options.
        """
        # Validate that at least one parameter is provided
        if not file_id and not file_name:
            return "Error: Either 'file_id' or 'file_name' must be provided."

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
            return (
                "An unexpected error occurred while obtaining access token for Google."
            )

        try:
            client = GoogleDriveClient(access_token)

            # If file_id is provided, read directly
            if file_id:
                return await _read_file_by_id(client, file_id)

            # Search for matching files
            assert (
                file_name is not None
            )  # Type checker: we know this is truthy from validation above
            # Escape single quotes and backslashes for Google Drive API query
            # Google Drive API requires escaping: ' -> \' and \ -> \\
            escaped_name = file_name.replace("\\", "\\\\").replace("'", "\\'")
            exact_search_query = f"name='{escaped_name}'"
            exact_matches = await client.search_files(
                exact_search_query, max_results=100
            )

            # Filter to ensure truly exact matches (case-sensitive)
            exact_matches = [f for f in exact_matches if f.name == file_name]

            if len(exact_matches) > 0:
                # Found exact matches - return options (don't auto-read)
                if len(exact_matches) == 1:
                    options_text = (
                        f"Found 1 file with the exact name '{file_name}':\n\n"
                    )
                else:
                    options_text = f"Found {len(exact_matches)} files with the exact name '{file_name}':\n\n"

                for idx, file in enumerate(exact_matches, 1):
                    mime_info = f" ({file.mime_type})" if file.mime_type else ""
                    size_info = ""
                    if file.size is not None:
                        if file.size < 1024:
                            size_info = f" - Size: {file.size} bytes"
                        elif file.size < 1024 * 1024:
                            size_info = f" - Size: {file.size / 1024:.2f} KB"
                        else:
                            size_info = f" - Size: {file.size / (1024 * 1024):.2f} MB"
                    modified_info = (
                        f" - Modified: {file.modified_time}"
                        if file.modified_time
                        else ""
                    )
                    options_text += f"{idx}. File ID: {file.id}{mime_info}{size_info}{modified_info}\n"
                options_text += "\nPlease use the 'file_id' parameter with one of the IDs above to read the specific file."
                return options_text
            else:
                # No exact match found - try a broader search with "contains"
                # For "contains" queries, we still need to escape special characters
                broader_search_query = (
                    file_name  # Will be auto-formatted as "name contains 'filename'"
                )
                similar_files = await client.search_files(
                    broader_search_query, max_results=100
                )

                if not similar_files:
                    return (
                        f"No files found with the name '{file_name}' in Google Drive."
                    )

                # Show similar matches as options
                options_text = f"No exact match found for '{file_name}', but found {len(similar_files)} similar file(s):\n\n"
                for idx, file in enumerate(
                    similar_files[:10], 1
                ):  # Limit to 10 results
                    mime_info = f" ({file.mime_type})" if file.mime_type else ""
                    size_info = ""
                    if file.size is not None:
                        if file.size < 1024:
                            size_info = f" - Size: {file.size} bytes"
                        elif file.size < 1024 * 1024:
                            size_info = f" - Size: {file.size / 1024:.2f} KB"
                        else:
                            size_info = f" - Size: {file.size / (1024 * 1024):.2f} MB"
                    modified_info = (
                        f" - Modified: {file.modified_time}"
                        if file.modified_time
                        else ""
                    )
                    options_text += f"{idx}. Name: '{file.name}' - File ID: {file.id}{mime_info}{size_info}{modified_info}\n"
                if len(similar_files) > 10:
                    options_text += f"\n... and {len(similar_files) - 10} more file(s)."
                options_text += "\n\nPlease use the 'file_id' parameter with one of the IDs above to read the specific file."
                return options_text

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                if file_id:
                    error_msg = f"File with ID '{file_id}' not found in Google Drive."
                else:
                    error_msg = (
                        f"File with name '{file_name}' not found in Google Drive."
                    )
            else:
                identifier = f"ID '{file_id}'" if file_id else f"name '{file_name}'"
                error_msg = f"HTTP error reading Google Drive file with {identifier}: {e.response.status_code} - {e.response.text}"
            logger.error(error_msg, exc_info=True)
            return error_msg
        except Exception as e:
            identifier = f"ID '{file_id}'" if file_id else f"name '{file_name}'"
            error_msg = f"Error reading Google Drive file with {identifier}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return error_msg

else:
    # Google provider not configured - log a message but don't register tools
    logger.info(
        "Google OAuth provider not configured. Google Drive tools will not be available. "
        "To enable them, configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
    )
