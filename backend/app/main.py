"""NovaWorks Project CRM API.

API routes live under /api. If the built frontend exists at FRONTEND_DIST it is
served for every other path, so one process serves the whole application.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.db import init_db
from app.errors import install_error_handlers
from app.routers import auth, projects, transcript, users

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("novaworks")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    log.info("database ready (%s), provider=%s, env=%s",
             settings.database_url.split("@")[-1], settings.llm_provider, settings.app_env)
    yield


app = FastAPI(title="NovaWorks Project CRM", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

install_error_handlers(app)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="novaworks_session",
    same_site="lax",
    https_only=settings.is_production,
    max_age=7 * 24 * 3600,
)

if not settings.is_production:
    # Lets the Vite dev server talk to the API directly if the proxy is not configured.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(users.router)
api.include_router(projects.router)
api.include_router(transcript.router)


@api.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


app.include_router(api)

class SpaStaticFiles(StaticFiles):
    """Serves the built frontend; unknown paths fall back to index.html for BrowserRouter deep links."""

    async def get_response(self, path: str, scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not path.startswith("api"):
                return await super().get_response("index.html", scope)
            raise


if settings.frontend_dist.is_dir():
    app.mount("/", SpaStaticFiles(directory=str(settings.frontend_dist), html=True), name="frontend")
    log.info("serving frontend from %s", settings.frontend_dist)
else:
    log.warning("frontend build not found at %s, serving API only", settings.frontend_dist)
