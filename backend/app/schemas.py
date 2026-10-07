"""Request and response models. JSON keys are camelCase on the wire.

Shapes follow frontend/docs/api-contract.md exactly.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models import Role


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# Users


class LoginRequest(ApiModel):
    email: str
    password: str


class UserOut(ApiModel):
    id: str
    name: str
    email: str
    role: Role
    specialization: str
    skills: list[str]


class UserRef(ApiModel):
    id: str
    name: str
    role: Role
    specialization: str


class UserEnvelope(ApiModel):
    user: UserOut


class UsersEnvelope(ApiModel):
    users: list[UserOut]


# Projects and tasks


class TaskOut(ApiModel):
    id: str
    project_id: str
    title: str
    description: str
    assignee_id: str
    assignee: UserRef | None
    deadline: date
    estimated_hours: float


class ProjectSummary(ApiModel):
    id: str
    name: str
    client_name: str
    description: str
    manager_id: str
    manager: UserRef | None
    deadline: date
    task_count: int
    total_hours: float
    created_at: datetime | None = None


class ProjectDetail(ProjectSummary):
    tasks: list[TaskOut]


class ProjectsEnvelope(ApiModel):
    projects: list[ProjectSummary]


class ProjectsDetailEnvelope(ApiModel):
    projects: list[ProjectDetail]


class ProjectEnvelope(ApiModel):
    project: ProjectDetail


# Transcript flow


class TranscriptRequest(ApiModel):
    transcript: str = ""


class TaskDraft(ApiModel):
    title: str = ""
    description: str = ""
    assignee_id: str | None = None
    assignee_name: str | None = None
    deadline: str | None = None
    estimated_hours: float | None = None


class ProjectDraft(ApiModel):
    name: str = ""
    client_name: str = ""
    description: str = ""
    manager_id: str | None = None
    manager_name: str | None = None
    deadline: str | None = None
    tasks: list[TaskDraft] = Field(default_factory=list)


class Draft(ApiModel):
    projects: list[ProjectDraft] = Field(default_factory=list)
    # Plain-language notes from the AI about values it could not resolve. Not part of the frontend Draft type.
    issues: list[str] = Field(default_factory=list)


class CommitRequest(ApiModel):
    draft: Draft


class DraftIssue(ApiModel):
    path: str
    message: str


class NeedsCorrection(ApiModel):
    status: str = "needs_correction"
    draft: Draft
    issues: list[DraftIssue]


class CreateTotals(ApiModel):
    projects: int
    tasks: int
    hours: float


class Created(ApiModel):
    status: str = "created"
    projects: list[ProjectDetail]
    totals: CreateTotals
    notes: list[str] = Field(default_factory=list)


class ErrorBody(ApiModel):
    code: str
    message: str


class ErrorEnvelope(ApiModel):
    error: ErrorBody
    detail: str
