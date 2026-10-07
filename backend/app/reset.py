"""Delete every project and task, keep the users.

    python -m app.reset
"""
from __future__ import annotations

from sqlalchemy import delete, func, select

from app.db import SessionLocal, init_db
from app.models import Project, Task


def reset_projects() -> tuple[int, int]:
    init_db()
    with SessionLocal() as db:
        tasks = db.scalar(select(func.count()).select_from(Task)) or 0
        projects = db.scalar(select(func.count()).select_from(Project)) or 0
        db.execute(delete(Task))
        db.execute(delete(Project))
        db.commit()
    return projects, tasks


if __name__ == "__main__":
    projects, tasks = reset_projects()
    print(f"Reset complete: removed {projects} projects and {tasks} tasks, users kept")
