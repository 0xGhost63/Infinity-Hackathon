from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import UsersEnvelope

router = APIRouter(tags=["team"])

_ROLE_ORDER = {"ADMIN": 0, "MANAGER": 1, "AGENT": 2}


@router.get("/team", response_model=UsersEnvelope)
def team(_: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UsersEnvelope:
    """Read-only team directory, visible to every signed-in user. Never includes password fields."""
    users = db.scalars(select(User)).all()
    return UsersEnvelope(users=sorted(users, key=lambda u: (_ROLE_ORDER.get(u.role.value, 9), u.id)))
