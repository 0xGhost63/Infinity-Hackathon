"""Provider adapters tested with faked HTTP responses (no network)."""
import json
from pathlib import Path

import httpx
import pytest

from app.ai import extract
from app.ai.extract import AIExtractionError, extract_draft
from app.config import Settings

DRAFT = (Path(__file__).resolve().parent / "fixtures" / "mock_draft.json").read_text()
DIRECTORY = [{"id": "PM01", "name": "Ayesha Khan", "role": "MANAGER", "specialization": "Web PM", "skills": []}]


def settings(provider, model="test-model"):
    base = {"openai": "https://api.openai.com/v1", "anthropic": "https://api.anthropic.com",
            "gemini": "https://generativelanguage.googleapis.com/v1beta"}[provider]
    return Settings(app_env="development", database_url="sqlite://", session_secret="s", llm_provider=provider,
                    llm_api_key="key", llm_model=model, llm_base_url=base, llm_timeout_seconds=5,
                    frontend_dist=Path("/x"), mock_draft_path=Path("/x"))


class FakePost:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, url, headers=None, json=None, timeout=None):
        self.calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        status, body = self.responses.pop(0)
        return httpx.Response(status, json=body, request=httpx.Request("POST", url))


def test_openai_strict_schema_and_temperature(monkeypatch):
    fake = FakePost([(200, {"choices": [{"message": {"content": DRAFT}}]})])
    monkeypatch.setattr(extract.httpx, "post", fake)
    draft = extract_draft("meeting text", DIRECTORY, settings("openai"))
    assert len(draft.projects) == 3
    call = fake.calls[0]
    assert call["url"] == "https://api.openai.com/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer key"
    assert call["json"]["temperature"] == 0
    assert call["json"]["response_format"]["type"] == "json_schema"
    assert call["json"]["response_format"]["json_schema"]["strict"] is True
    assert "TEAM DIRECTORY" in call["json"]["messages"][1]["content"]
    assert "meeting text" in call["json"]["messages"][1]["content"]
    assert call["timeout"] == 5


def test_openai_reasoning_model_omits_temperature_and_falls_back(monkeypatch):
    fake = FakePost([
        (400, {"error": {"message": "response_format json_schema not supported"}}),
        (200, {"choices": [{"message": {"content": "```json\n" + DRAFT + "\n```"}}]}),
    ])
    monkeypatch.setattr(extract.httpx, "post", fake)
    draft = extract_draft("t", DIRECTORY, settings("openai", model="gpt-5-mini"))
    assert len(draft.projects) == 3
    assert "temperature" not in fake.calls[0]["json"]
    assert fake.calls[1]["json"]["response_format"] == {"type": "json_object"}


def test_openai_retries_once_on_bad_json_then_fails(monkeypatch):
    fake = FakePost([
        (200, {"choices": [{"message": {"content": "not json"}}]}),
        (200, {"choices": [{"message": {"content": "{\"projects\": \"wrong type\"}"}}]}),
    ])
    monkeypatch.setattr(extract.httpx, "post", fake)
    with pytest.raises(AIExtractionError):
        extract_draft("t", DIRECTORY, settings("openai"))
    assert len(fake.calls) == 2
    assert "could not be used" in fake.calls[1]["json"]["messages"][1]["content"]


def test_openai_http_error(monkeypatch):
    fake = FakePost([(401, {"error": "bad key"})])
    monkeypatch.setattr(extract.httpx, "post", fake)
    with pytest.raises(AIExtractionError) as exc:
        extract_draft("t", DIRECTORY, settings("openai"))
    assert "401" in str(exc.value)


def test_anthropic_tool_use(monkeypatch):
    fake = FakePost([(200, {"content": [{"type": "text", "text": "ok"}, {"type": "tool_use", "name": "submit_draft", "input": json.loads(DRAFT)}]})])
    monkeypatch.setattr(extract.httpx, "post", fake)
    draft = extract_draft("t", DIRECTORY, settings("anthropic"))
    assert len(draft.projects) == 3 and draft.projects[0].tasks[0].estimated_hours == 12
    call = fake.calls[0]
    assert call["url"] == "https://api.anthropic.com/v1/messages"
    assert call["headers"]["x-api-key"] == "key" and call["headers"]["anthropic-version"]
    assert call["json"]["tool_choice"] == {"type": "tool", "name": "submit_draft"}
    assert call["json"]["tools"][0]["input_schema"]["required"] == ["projects", "issues"]


def test_gemini_json_mode(monkeypatch):
    fake = FakePost([(200, {"candidates": [{"content": {"parts": [{"text": DRAFT}]}}]})])
    monkeypatch.setattr(extract.httpx, "post", fake)
    draft = extract_draft("t", DIRECTORY, settings("gemini", model="gemini-x"))
    assert len(draft.projects) == 3
    call = fake.calls[0]
    assert call["url"].endswith("/models/gemini-x:generateContent")
    assert call["headers"]["x-goog-api-key"] == "key"
    assert call["json"]["generationConfig"]["response_mime_type"] == "application/json"


def test_wrapped_object_and_timeout(monkeypatch):
    fake = FakePost([(200, {"choices": [{"message": {"content": json.dumps({"draft": json.loads(DRAFT)})}}]})])
    monkeypatch.setattr(extract.httpx, "post", fake)
    assert len(extract_draft("t", DIRECTORY, settings("openai")).projects) == 3

    def timeout(*a, **k):
        raise httpx.ReadTimeout("slow")
    monkeypatch.setattr(extract.httpx, "post", timeout)
    with pytest.raises(AIExtractionError) as exc:
        extract_draft("t", DIRECTORY, settings("openai"))
    assert "timed out" in str(exc.value)
