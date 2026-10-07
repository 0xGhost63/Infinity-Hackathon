"""Transcript to draft extraction.

extract_draft(transcript, directory) -> Draft

The provider is chosen by LLM_PROVIDER. Every provider returns raw JSON text,
which is parsed into the Draft model. A parse or schema failure is retried once
with the error fed back to the model. Anything else raises AIExtractionError.
"""
from __future__ import annotations

import json
import logging
import re
import time

import httpx
from pydantic import ValidationError

from app.ai.prompt import DRAFT_JSON_SCHEMA, build_system_prompt, build_user_message
from app.config import Settings, get_settings
from app.schemas import Draft

log = logging.getLogger("novaworks.ai")

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
_REASONING_PREFIXES = ("o1", "o3", "o4", "gpt-5")


class AIExtractionError(Exception):
    """The provider failed or returned output that cannot be used."""


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = _FENCE_RE.sub("", text).strip()
    return text


def _parse_draft(raw: str) -> Draft:
    data = json.loads(_strip_fences(raw))
    if isinstance(data, dict) and "projects" not in data and len(data) == 1:
        # Some models wrap the object in a single key such as {"draft": {...}}
        inner = next(iter(data.values()))
        if isinstance(inner, dict):
            data = inner
    return Draft.model_validate(data)


# Providers


def _call_openai(system: str, user: str, settings: Settings, strict: bool = True) -> str:
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    body: dict = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if not settings.llm_model.lower().startswith(_REASONING_PREFIXES):
        body["temperature"] = 0
    if strict:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "project_draft", "strict": True, "schema": DRAFT_JSON_SCHEMA},
        }
    else:
        body["response_format"] = {"type": "json_object"}

    response = httpx.post(
        url,
        headers={
            "Authorization": f"Bearer {settings.llm_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://novaworks.example",
            "X-Title": "NovaWorks Project CRM",
        },
        json=body,
        timeout=settings.llm_timeout_seconds,
    )
    if response.status_code == 400 and strict and "response_format" in response.text:
        log.warning("Provider rejected json_schema mode, retrying with json_object mode")
        return _call_openai(system, user, settings, strict=False)
    _raise_for_status(response)
    data = response.json()
    try:
        message = data["choices"][0]["message"]
        if message.get("refusal"):
            raise AIExtractionError(f"Model refused: {message['refusal']}")
        return message["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIExtractionError(f"Unexpected response shape from provider: {exc}") from exc


def _call_anthropic(system: str, user: str, settings: Settings) -> str:
    url = settings.llm_base_url.rstrip("/") + "/v1/messages"
    body = {
        "model": settings.llm_model,
        "max_tokens": 8192,
        "temperature": 0,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "tools": [
            {
                "name": "submit_draft",
                "description": "Submit the extracted projects and tasks.",
                "input_schema": DRAFT_JSON_SCHEMA,
            }
        ],
        "tool_choice": {"type": "tool", "name": "submit_draft"},
    }
    response = httpx.post(
        url,
        headers={
            "x-api-key": settings.llm_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json=body,
        timeout=settings.llm_timeout_seconds,
    )
    _raise_for_status(response)
    data = response.json()
    for block in data.get("content", []):
        if block.get("type") == "tool_use":
            return json.dumps(block.get("input", {}))
    for block in data.get("content", []):
        if block.get("type") == "text":
            return block.get("text", "")
    raise AIExtractionError("Provider returned no usable content")


def _call_gemini(system: str, user: str, settings: Settings) -> str:
    url = f"{settings.llm_base_url.rstrip('/')}/models/{settings.llm_model}:generateContent"
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0, "response_mime_type": "application/json"},
    }
    response = httpx.post(
        url,
        headers={"x-goog-api-key": settings.llm_api_key, "Content-Type": "application/json"},
        json=body,
        timeout=settings.llm_timeout_seconds,
    )
    _raise_for_status(response)
    data = response.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(part.get("text", "") for part in parts)
    except (KeyError, IndexError, TypeError) as exc:
        raise AIExtractionError(f"Unexpected response shape from provider: {exc}") from exc


def _call_mock(system: str, user: str, settings: Settings) -> str:
    """Local development only. Returns a fixture so the frontend can be built without API calls."""
    path = settings.mock_draft_path
    if not path.exists():
        raise AIExtractionError(f"Mock draft file not found: {path}")
    time.sleep(1.0)
    return path.read_text(encoding="utf-8")


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code >= 400:
        snippet = response.text[:500]
        raise AIExtractionError(f"Provider returned HTTP {response.status_code}: {snippet}")


_PROVIDERS = {
    "openai": _call_openai,
    "openrouter": _call_openai,
    "groq": _call_openai,
    "anthropic": _call_anthropic,
    "gemini": _call_gemini,
    "mock": _call_mock,
}


# Public entry point


def extract_draft(transcript: str, directory: list[dict], settings: Settings | None = None) -> Draft:
    settings = settings or get_settings()
    call = _PROVIDERS[settings.llm_provider]
    system = build_system_prompt()
    user = build_user_message(transcript, directory)

    last_error: str | None = None
    for attempt in (1, 2):
        message = user
        if last_error:
            message += (
                "\n\nYour previous reply could not be used: "
                + last_error
                + "\nReturn only valid JSON that matches the schema."
            )
        started = time.perf_counter()
        try:
            raw = call(system, message, settings)
        except httpx.TimeoutException as exc:
            raise AIExtractionError("The AI provider timed out") from exc
        except httpx.HTTPError as exc:
            raise AIExtractionError(f"Could not reach the AI provider: {exc}") from exc
        elapsed = time.perf_counter() - started
        try:
            draft = _parse_draft(raw)
            log.info("extraction attempt %d succeeded in %.1fs (%d projects)", attempt, elapsed, len(draft.projects))
            return draft
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            last_error = str(exc)[:800]
            log.warning("extraction attempt %d returned unusable output in %.1fs: %s", attempt, elapsed, last_error)

    raise AIExtractionError(f"The AI returned invalid output twice: {last_error}")
