from __future__ import annotations

import enum
from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    AGENT = "AGENT"


def _new_id() -> str:
    return str(uuid4())


class User(Base):
    __tablename__ = "users"

    # The reference codes from the brief are the primary keys: ADMIN, PM01..PM03, DEV01..DEV06.
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), nullable=False)
    specialization: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    client_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    manager_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    deadline: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    manager: Mapped[User] = relationship(foreign_keys=[manager_id], lazy="selectin")
    tasks: Mapped[list[Task]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Task.deadline, Task.title",
    )


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (CheckConstraint("estimated_hours > 0", name="ck_task_hours_positive"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    assignee_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    deadline: Mapped[date] = mapped_column(Date, nullable=False)
    estimated_hours: Mapped[float] = mapped_column(Numeric(7, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="tasks")
    assignee: Mapped[User] = relationship(foreign_keys=[assignee_id], lazy="selectin")
