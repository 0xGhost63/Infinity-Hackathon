"""Error envelope: {"error": {"code", "message"}, "detail": message}.

The frontend reads error.message, and also understands FastAPI's plain detail string.
Routers raise HTTPException(status, detail="message") or detail={"code": ..., "message": ...}.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from starlette.exceptions import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

DEFAULT_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "VALIDATION_ERROR",
    500: "SERVER_ERROR",
    502: "AI_UNAVAILABLE",
}


def error_response(status: int, message: str, code: str | None = None) -> JSONResponse:
    code = code or DEFAULT_CODES.get(status, f"HTTP_{status}")
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}, "detail": message})


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def _http_exception(_: Request, exc: HTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict):
            return error_response(exc.status_code, str(exc.detail.get("message", "")), exc.detail.get("code"))
        return error_response(exc.status_code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _request_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(x) for x in first.get("loc", []) if x != "body")
        message = f"The request was not valid: {where} {first.get('msg', '')}".strip()
        return error_response(400, message, "INVALID_REQUEST")
