"""Application settings, read once from environment variables.

Loads a .env file from the repository root or from backend/ if present.
Production (APP_ENV=production) fails fast when a required value is missing.
"""
from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

for _env_path in (ROOT_DIR / ".env", BACKEND_DIR / ".env"):
    if _env_path.exists():
        load_dotenv(_env_path, override=False)

log = logging.getLogger("novaworks")

SUPPORTED_PROVIDERS = ("openai", "openrouter", "groq", "anthropic", "gemini", "mock")
# openrouter and groq are OpenAI-compatible: same request shape, different base URL.
OPENAI_COMPATIBLE = {"openai": "https://api.openai.com/v1", "openrouter": "https://openrouter.ai/api/v1",
                     "groq": "https://api.groq.com/openai/v1"}


def normalize_database_url(url: str) -> str:
    """Accept Aiven's postgres:// URI (and plain postgresql://) and use the psycopg 3 driver."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    session_secret: str
    llm_provider: str
    llm_api_key: str
    llm_model: str
    llm_base_url: str
    llm_timeout_seconds: float
    frontend_dist: Path
    mock_draft_path: Path

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    is_production = app_env == "production"

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        if is_production:
            raise RuntimeError("DATABASE_URL is required in production")
        database_url = f"sqlite:///{BACKEND_DIR / 'dev.db'}"
        log.warning("DATABASE_URL not set, using local SQLite file %s", database_url)
    database_url = normalize_database_url(database_url)

    session_secret = os.getenv("SESSION_SECRET", "").strip()
    if not session_secret:
        if is_production:
            raise RuntimeError("SESSION_SECRET is required in production")
        session_secret = secrets.token_hex(32)
        log.warning("SESSION_SECRET not set, using a random secret (sessions reset on restart)")

    llm_provider = os.getenv("LLM_PROVIDER", "openai").strip().lower()
    if llm_provider not in SUPPORTED_PROVIDERS:
        raise RuntimeError(f"LLM_PROVIDER must be one of {SUPPORTED_PROVIDERS}, got {llm_provider!r}")
    llm_api_key = os.getenv("LLM_API_KEY", "").strip()
    llm_model = os.getenv("LLM_MODEL", "").strip()
    if llm_provider != "mock":
        if not llm_api_key:
            raise RuntimeError("LLM_API_KEY is required unless LLM_PROVIDER=mock")
        if not llm_model:
            raise RuntimeError("LLM_MODEL is required unless LLM_PROVIDER=mock")
    elif is_production:
        raise RuntimeError("LLM_PROVIDER=mock is for local frontend development only")
    else:
        log.warning("LLM_PROVIDER=mock: transcript conversion returns a fixture, not real AI output")

    default_base = {
        **OPENAI_COMPATIBLE,
        "anthropic": "https://api.anthropic.com",
        "gemini": "https://generativelanguage.googleapis.com/v1beta",
    }.get(llm_provider, "")
    llm_base_url = os.getenv("LLM_BASE_URL", "").strip() or default_base

    frontend_dist = Path(os.getenv("FRONTEND_DIST", "").strip() or str(ROOT_DIR / "frontend" / "dist"))
    if not frontend_dist.is_absolute():
        frontend_dist = (BACKEND_DIR / frontend_dist).resolve()

    mock_draft_path = Path(os.getenv("MOCK_DRAFT_PATH", "").strip() or str(BACKEND_DIR / "tests" / "fixtures" / "mock_draft.json"))

    return Settings(
        app_env=app_env,
        database_url=database_url,
        session_secret=session_secret,
        llm_provider=llm_provider,
        llm_api_key=llm_api_key,
        llm_model=llm_model,
        llm_base_url=llm_base_url,
        llm_timeout_seconds=float(os.getenv("LLM_TIMEOUT_SECONDS", "").strip() or "120"),
        frontend_dist=frontend_dist,
        mock_draft_path=mock_draft_path,
    )
