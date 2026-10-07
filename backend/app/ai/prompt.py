"""System prompt and output schema for transcript extraction.

The prompt is generic on purpose. It contains no names, dates or facts from any
particular meeting, so a changed transcript produces a changed result.
"""
from __future__ import annotations

import json

SYSTEM_PROMPT = """You convert a project-planning meeting transcript into projects and tasks for a
project-management CRM. Return only JSON that matches the schema.

Rules:
1. Final decisions win. If a deadline, estimate, owner or scope changes later in
   the meeting, use the last agreed value. A closing recap is authoritative.
2. Create one project per client engagement the meeting agrees to deliver.
   Discussion of internal tools or process is not a project. Never merge or split
   projects or tasks beyond what was agreed: two tasks with one owner stay two.
3. Leave out anything rejected, excluded or deferred to future work. Create no
   tasks for it; you may mention the exclusion in the project description.
4. Use only people from TEAM DIRECTORY, referenced by id. managerId must be a
   MANAGER and assigneeId an AGENT. Never invent people. Clients, end users and
   external contacts are never managers or assignees.
5. estimatedHours is the developer effort stated in the meeting, not calendar
   days. Do not create management or meeting tasks.
6. Dates are YYYY-MM-DD. If no year is stated, use the meeting's year.
7. Use the project and task names agreed in the meeting. One-sentence descriptions.
8. If a required value (manager, assignee, deadline, hours) is missing or
   ambiguous, set it to null and explain in "issues". Never guess. When a
   person cannot be matched to a directory id, put the name as spoken in
   managerName or assigneeName so a human can resolve it. Otherwise set those
   name fields to null.
"""

TASK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "assigneeId": {"type": ["string", "null"]},
        "assigneeName": {"type": ["string", "null"], "description": "Owner name as spoken, when no directory id fits"},
        "deadline": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "estimatedHours": {"type": ["number", "null"]},
    },
    "required": ["title", "description", "assigneeId", "assigneeName", "deadline", "estimatedHours"],
}

PROJECT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "name": {"type": "string"},
        "clientName": {"type": "string"},
        "description": {"type": "string"},
        "managerId": {"type": ["string", "null"]},
        "managerName": {"type": ["string", "null"], "description": "Manager name as spoken, when no directory id fits"},
        "deadline": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "tasks": {"type": "array", "items": TASK_SCHEMA},
    },
    "required": ["name", "clientName", "description", "managerId", "managerName", "deadline", "tasks"],
}

DRAFT_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "projects": {"type": "array", "items": PROJECT_SCHEMA},
        "issues": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Plain-language notes about values that could not be resolved",
        },
    },
    "required": ["projects", "issues"],
}


def build_system_prompt() -> str:
    return SYSTEM_PROMPT + "\nThe JSON must match this schema exactly:\n" + json.dumps(DRAFT_JSON_SCHEMA)


def build_user_message(transcript: str, directory: list[dict]) -> str:
    return (
        "TEAM DIRECTORY:\n"
        + json.dumps(directory, ensure_ascii=False)
        + "\n\nTRANSCRIPT:\n<<<\n"
        + transcript.strip()
        + "\n>>>"
    )
