from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import SESSION_USER_KEY, get_current_user
from app.models import User
from app.schemas import LoginRequest, UserEnvelope
from app.security import verify_password

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=UserEnvelope)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> UserEnvelope:
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS",
                                                     "message": "The email or password is incorrect."})
    request.session.clear()
    request.session[SESSION_USER_KEY] = user.id
    return UserEnvelope(user=user)


@router.post("/auth/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@router.get("/auth/me", response_model=UserEnvelope)
def me(user: User = Depends(get_current_user)) -> UserEnvelope:
    return UserEnvelope(user=user)
