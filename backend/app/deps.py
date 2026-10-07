"""Request dependencies. Identity always comes from the server session, never from the client."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Role, User

SESSION_USER_KEY = "user_id"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get(SESSION_USER_KEY)
    user = db.get(User, user_id) if user_id else None
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail={"code": "UNAUTHENTICATED", "message": "Sign in to continue."})
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Only the administrator can do this."})
    return user
