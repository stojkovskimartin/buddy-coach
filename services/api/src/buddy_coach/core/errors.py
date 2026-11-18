"""Domain errors and their mapping to RFC 9457 problem details."""

from __future__ import annotations

import logging
from typing import Any, ClassVar

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

PROBLEM_JSON = "application/problem+json"


class DomainError(Exception):
    """Base class for expected, user-facing errors raised by domain code."""

    status_code: ClassVar[int] = status.HTTP_400_BAD_REQUEST
    code: ClassVar[str] = "domain_error"
    title: ClassVar[str] = "Request could not be processed"

    def __init__(self, detail: str, **context: Any) -> None:
        super().__init__(detail)
        self.detail = detail
        self.context = context


class NotFoundError(DomainError):
    """A requested resource does not exist (or is not visible to the caller)."""

    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    title = "Resource not found"


class ConflictError(DomainError):
    """The request conflicts with the current state, e.g. a duplicate."""

    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    title = "Conflict"


class ValidationFailedError(DomainError):
    """Input is well-formed but violates a business rule."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "validation_failed"
    title = "Validation failed"


class AuthenticationError(DomainError):
    """Missing, invalid or expired credentials."""

    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthenticated"
    title = "Authentication required"


class PermissionDeniedError(DomainError):
    """Authenticated, but not allowed to perform this action."""

    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"
    title = "Permission denied"


def _problem(status_code: int, title: str, detail: str, code: str, **extra: Any) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"https://errors.buddy-coach.app/{code}",
        "title": title,
        "status": status_code,
        "detail": detail,
        "code": code,
        **extra,
    }
    headers = (
        {"WWW-Authenticate": "Bearer"} if status_code == status.HTTP_401_UNAUTHORIZED else None
    )
    return JSONResponse(body, status_code=status_code, media_type=PROBLEM_JSON, headers=headers)


async def _domain_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)  # noqa: S101  # registered only for DomainError
    return _problem(exc.status_code, exc.title, exc.detail, exc.code)


async def _validation_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    errors = [
        {"loc": list(err.get("loc", ())), "msg": err.get("msg", ""), "type": err.get("type", "")}
        for err in exc.errors()
    ]
    return _problem(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Invalid request",
        "The request body or parameters are invalid.",
        "invalid_request",
        errors=errors,
    )


async def _unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    # Never leak internals to clients; the full trace goes to the logs with the request id.
    logger.error("unhandled_error", exc_info=exc)
    return _problem(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal server error",
        "Something went wrong on our side.",
        "internal_error",
    )


def register_error_handlers(app: FastAPI) -> None:
    """Attach the problem-details handlers to the app."""
    app.add_exception_handler(DomainError, _domain_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)
