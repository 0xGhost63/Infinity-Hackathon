from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.access import project_scope
from app.db import get_db
from app.deps import get_current_user
from app.models import Project, User
from app.schemas import ProjectEnvelope, ProjectsDetailEnvelope, ProjectsEnvelope
from app.serializers import project_detail, project_summary

router = APIRouter(tags=["projects"])


@router.get("/projects", response_model=ProjectsEnvelope | ProjectsDetailEnvelope,
            responses={200: {"description": "Add ?include=tasks for ProjectDetail rows"}})
def list_projects(include: str | None = Query(default=None), user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    projects = db.scalars(project_scope(user).order_by(Project.deadline, Project.name)).all()
    if include == "tasks":
        body = ProjectsDetailEnvelope(projects=[project_detail(user, p) for p in projects])
    else:
        body = ProjectsEnvelope(projects=[project_summary(user, p) for p in projects])
    return JSONResponse(content=body.model_dump(mode="json", by_alias=True))


@router.get("/projects/{project_id}", response_model=ProjectEnvelope)
def get_project(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProjectEnvelope:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="This project could not be found.")
    allowed = db.scalar(project_scope(user).where(Project.id == project_id))
    if allowed is None:
        raise HTTPException(status_code=403, detail="You do not have access to this project.")
    return ProjectEnvelope(project=project_detail(user, project))
