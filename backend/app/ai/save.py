"""All-or-nothing persistence of a validated draft."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.ai.validate import parse_iso_date
from app.models import Project, Task
from app.schemas import Draft


def save_draft(db: Session, draft: Draft) -> list[Project]:
    """Insert every project and task in one transaction. Raises on failure, saving nothing."""
    projects: list[Project] = []
    for p in draft.projects:
        project = Project(
            name=p.name.strip(),
            client_name=p.client_name.strip(),
            description=(p.description or "").strip(),
            manager_id=p.manager_id.strip(),  # validated before this point
            deadline=parse_iso_date(p.deadline),
        )
        project.tasks = [
            Task(
                title=t.title.strip(),
                description=(t.description or "").strip(),
                assignee_id=t.assignee_id.strip(),
                deadline=parse_iso_date(t.deadline),
                estimated_hours=t.estimated_hours,
            )
            for t in p.tasks
        ]
        projects.append(project)

    try:
        db.add_all(projects)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return projects
