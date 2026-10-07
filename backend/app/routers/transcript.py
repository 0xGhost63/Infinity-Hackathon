from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.extract import AIExtractionError, extract_draft
from app.ai.save import save_draft
from app.ai.validate import validate_draft
from app.db import get_db
from app.deps import require_admin
from app.models import Role, User
from app.schemas import CommitRequest, Created, CreateTotals, Draft, DraftIssue, NeedsCorrection, TranscriptRequest
from app.serializers import project_detail

router = APIRouter(tags=["transcripts"])
log = logging.getLogger("novaworks.transcript")


def _load_users(db: Session) -> dict[str, User]:
    return {u.id: u for u in db.scalars(select(User)).all()}


def _directory(users: dict[str, User]) -> list[dict]:
    """What the AI sees: id, name, role, specialization, skills. Never emails or passwords."""
    return [
        {"id": u.id, "name": u.name, "role": u.role.value, "specialization": u.specialization,
         "skills": list(u.skills or [])}
        for u in sorted(users.values(), key=lambda u: u.id)
        if u.role in (Role.MANAGER, Role.AGENT)
    ]


def _json(model, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content=model.model_dump(mode="json", by_alias=True))


def _validate_and_save(draft: Draft, users: dict[str, User], db: Session, admin: User, started: float, source: str):
    if not draft.projects:
        log.info("transcript %s by %s: no projects found", source, admin.id)
        raise HTTPException(status_code=422, detail={"code": "NO_PROJECTS_FOUND",
                                                     "message": "No projects were found in the transcript. Check the text and try again."})
    errors = validate_draft(draft, users)
    if errors:
        # The AI's own notes are shown too, attached to the whole draft.
        issues = errors + [DraftIssue(path="projects", message=note) for note in draft.issues if note.strip()]
        log.info("transcript %s by %s: %d validation errors, nothing saved (%.1fs)",
                 source, admin.id, len(errors), time.perf_counter() - started)
        return _json(NeedsCorrection(draft=draft, issues=issues), 422)
    try:
        projects = save_draft(db, draft)
    except Exception:
        log.exception("transcript %s by %s: save failed, rolled back", source, admin.id)
        raise HTTPException(status_code=500, detail={"code": "SAVE_FAILED",
                                                     "message": "Saving failed and nothing was stored. Try again."})
    details = [project_detail(admin, p) for p in projects]
    totals = CreateTotals(projects=len(details), tasks=sum(d.task_count for d in details),
                          hours=float(sum(d.total_hours for d in details)))
    log.info("transcript %s by %s: saved %d projects, %d tasks (%.1fs)",
             source, admin.id, totals.projects, totals.tasks, time.perf_counter() - started)
    return _json(Created(projects=details, totals=totals, notes=list(draft.issues)), 201)


@router.post("/transcripts/convert", status_code=201, response_model=Created, responses={422: {"model": NeedsCorrection}})
def convert_transcript(body: TranscriptRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Sync endpoint on purpose: the provider call blocks for up to a minute and runs in the thread pool."""
    text = (body.transcript or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail={"code": "EMPTY_TRANSCRIPT",
                                                     "message": "Paste the meeting transcript before creating projects."})
    users = _load_users(db)
    started = time.perf_counter()
    try:
        draft = extract_draft(text, _directory(users))
    except AIExtractionError as exc:
        log.error("transcript convert by %s: AI failed after %.1fs: %s", admin.id, time.perf_counter() - started, exc)
        code = "AI_INVALID_OUTPUT" if "invalid output" in str(exc) else "AI_UNAVAILABLE"
        raise HTTPException(status_code=502, detail={"code": code,
                                                     "message": "The AI step failed and nothing was saved. Try again."})
    return _validate_and_save(draft, users, db, admin, started, "convert")


@router.post("/transcripts/commit", status_code=201, response_model=Created, responses={422: {"model": NeedsCorrection}})
def commit_draft(body: CommitRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Saves an administrator-corrected draft after validating it again from scratch."""
    return _validate_and_save(body.draft, _load_users(db), db, admin, time.perf_counter(), "commit")
