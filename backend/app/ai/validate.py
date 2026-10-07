"""Business validation of a draft before anything is saved.

Collects every problem with a dotted path such as projects.1.tasks.3.assigneeId,
so the frontend can highlight each field.
"""
from __future__ import annotations

import re
from datetime import date

from app.models import Role, User
from app.schemas import Draft, DraftIssue as FieldError

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

MSG_NO_PROJECTS = "Add at least one project"
MSG_PROJECT_NAME = "Enter a project name"
MSG_CLIENT_NAME = "Enter a client name"
MSG_MANAGER = "Choose a manager from the team directory"
MSG_DEADLINE = "Enter a valid deadline"
MSG_TASK_TITLE = "Enter a task title"
MSG_ASSIGNEE = "Choose an agent from the team directory"
MSG_TASK_DEADLINE = "Task deadline must be on or before the project deadline"
MSG_HOURS = "Enter the estimated hours"


def parse_iso_date(value: str | None) -> date | None:
    """Strict YYYY-MM-DD. Returns None for anything else, including impossible dates."""
    if not value or not _DATE_RE.match(value.strip()):
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _is_text(value: str | None) -> bool:
    return bool(value and value.strip())


def _person_ok(user_id: str | None, users: dict[str, User], role: Role) -> bool:
    if not user_id:
        return False
    user = users.get(user_id.strip())
    return user is not None and user.role == role


def _named(message: str, raw_name: str | None) -> str:
    """Mention the name the AI read when it could not be matched to the directory."""
    if raw_name and raw_name.strip():
        return f"{raw_name.strip()} is not in the team directory. {message}"
    return message


def validate_draft(draft: Draft, users: dict[str, User]) -> list[FieldError]:
    errors: list[FieldError] = []

    if not draft.projects:
        errors.append(FieldError(path="projects", message=MSG_NO_PROJECTS))
        return errors

    for i, project in enumerate(draft.projects):
        base = f"projects.{i}"
        if not _is_text(project.name):
            errors.append(FieldError(path=f"{base}.name", message=MSG_PROJECT_NAME))
        if not _is_text(project.client_name):
            errors.append(FieldError(path=f"{base}.clientName", message=MSG_CLIENT_NAME))
        if not _person_ok(project.manager_id, users, Role.MANAGER):
            errors.append(FieldError(path=f"{base}.managerId", message=_named(MSG_MANAGER, project.manager_name)))
        project_deadline = parse_iso_date(project.deadline)
        if project_deadline is None:
            errors.append(FieldError(path=f"{base}.deadline", message=MSG_DEADLINE))

        for j, task in enumerate(project.tasks):
            tb = f"{base}.tasks.{j}"
            if not _is_text(task.title):
                errors.append(FieldError(path=f"{tb}.title", message=MSG_TASK_TITLE))
            if not _person_ok(task.assignee_id, users, Role.AGENT):
                errors.append(FieldError(path=f"{tb}.assigneeId", message=_named(MSG_ASSIGNEE, task.assignee_name)))
            task_deadline = parse_iso_date(task.deadline)
            if task_deadline is None:
                errors.append(FieldError(path=f"{tb}.deadline", message=MSG_DEADLINE))
            elif project_deadline is not None and task_deadline > project_deadline:
                errors.append(FieldError(path=f"{tb}.deadline", message=MSG_TASK_DEADLINE))
            if task.estimated_hours is None or task.estimated_hours <= 0:
                errors.append(FieldError(path=f"{tb}.estimatedHours", message=MSG_HOURS))

    return errors
