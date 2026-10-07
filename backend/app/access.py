"""All role scoping lives here. Every read endpoint builds its query through these functions."""
from __future__ import annotations

from sqlalchemy import Select, select

from app.models import Project, Role, Task, User


def project_scope(user: User) -> Select:
    q = select(Project)
    if user.role == Role.MANAGER:
        q = q.where(Project.manager_id == user.id)
    elif user.role == Role.AGENT:
        q = q.where(Project.tasks.any(Task.assignee_id == user.id))
    return q  # ADMIN sees every project


def task_scope(user: User, project_id: str) -> Select:
    q = select(Task).where(Task.project_id == project_id)
    if user.role == Role.AGENT:
        q = q.where(Task.assignee_id == user.id)
    return q


def visible_tasks(user: User, project: Project) -> list[Task]:
    """Filter an already loaded task list by the same rule as task_scope."""
    if user.role == Role.AGENT:
        return [t for t in project.tasks if t.assignee_id == user.id]
    return list(project.tasks)
