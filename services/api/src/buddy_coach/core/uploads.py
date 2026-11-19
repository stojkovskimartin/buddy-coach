"""Reading raw upload bodies with a hard size cap, enforced while streaming, so an oversized
upload never reaches memory or disk (no multipart, no temporary files)."""

from __future__ import annotations

from fastapi import Request

from buddy_coach.core.errors import PayloadTooLargeError


async def read_capped(request: Request, max_bytes: int) -> bytes:
    """The request body, or PayloadTooLargeError once it passes ``max_bytes``."""
    message = f"The file can be at most {max_bytes // (1024 * 1024)} MB."
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes:
        raise PayloadTooLargeError(message)
    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > max_bytes:
            raise PayloadTooLargeError(message)
        chunks.append(chunk)
    return b"".join(chunks)
