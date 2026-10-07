"""ORM to API shapes, applying the caller's visibility rules."""
from __future__ import annotations

from app.access import visible_tasks
from app.models import Project, Task, User
from app.schemas import ProjectDetail, ProjectSummary, TaskOut, UserRef


def user_ref(user: User | None) -> UserRef | None:
    if user is None:
        return None
    return UserRef(id=user.id, name=user.name, role=user.role, specialization=user.specialization)


def task_out(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        assignee_id=task.assignee_id,
        assignee=user_ref(task.assignee),
        deadline=task.deadline,
        estimated_hours=float(task.estimated_hours),
    )


def total_hours(tasks: list[Task]) -> float:
    return float(sum(float(t.estimated_hours) for t in tasks))


def _summary_fields(viewer: User, project: Project) -> dict:
    tasks = visible_tasks(viewer, project)
    return dict(
        id=project.id,
        name=project.name,
        client_name=project.client_name,
        description=project.description,
        manager_id=project.manager_id,
        manager=user_ref(project.manager),
        deadline=project.deadline,
        task_count=len(tasks),
        total_hours=total_hours(tasks),
        created_at=project.created_at,
        _tasks=tasks,
    )


def project_summary(viewer: User, project: Project) -> ProjectSummary:
    fields = _summary_fields(viewer, project)
    fields.pop("_tasks")
    return ProjectSummary(**fields)


def project_detail(viewer: User, project: Project) -> ProjectDetail:
    fields = _summary_fields(viewer, project)
    tasks = fields.pop("_tasks")
    return ProjectDetail(**fields, tasks=[task_out(t) for t in tasks])
