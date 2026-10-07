from app.ai.validate import validate_draft
from app.models import Role, User
from app.schemas import Draft


def users():
    mk = lambda i, r: User(id=i, name=i, email=f"{i}@x", password_hash="", role=r, specialization="", skills=[])
    return {"PM01": mk("PM01", Role.MANAGER), "DEV01": mk("DEV01", Role.AGENT), "ADMIN": mk("ADMIN", Role.ADMIN)}


def good():
    return Draft.model_validate({"projects": [{"name": "P", "clientName": "C", "description": "", "managerId": "PM01",
            "deadline": "2026-10-20", "tasks": [{"title": "T", "description": "", "assigneeId": "DEV01",
            "deadline": "2026-10-12", "estimatedHours": 12}]}], "issues": []})


def paths(draft):
    return {e.path for e in validate_draft(draft, users())}


def test_valid_draft_has_no_errors():
    assert paths(good()) == set()


def test_empty_projects():
    assert paths(Draft()) == {"projects"}


def test_manager_must_be_manager_role():
    d = good(); d.projects[0].manager_id = "DEV01"
    assert paths(d) == {"projects.0.managerId"}


def test_assignee_must_be_agent_and_exist():
    d = good(); d.projects[0].tasks[0].assignee_id = "PM01"
    assert paths(d) == {"projects.0.tasks.0.assigneeId"}
    d.projects[0].tasks[0].assignee_id = "KAMRAN"
    assert paths(d) == {"projects.0.tasks.0.assigneeId"}
    d.projects[0].tasks[0].assignee_id = None
    assert paths(d) == {"projects.0.tasks.0.assigneeId"}


def test_dates_strict():
    d = good(); d.projects[0].deadline = "2026-02-30"
    assert paths(d) == {"projects.0.deadline"}
    d = good(); d.projects[0].tasks[0].deadline = "20261012"
    assert paths(d) == {"projects.0.tasks.0.deadline"}


def test_task_after_project_deadline():
    d = good(); d.projects[0].tasks[0].deadline = "2026-10-21"
    assert paths(d) == {"projects.0.tasks.0.deadline"}


def test_hours_positive():
    d = good(); d.projects[0].tasks[0].estimated_hours = 0
    assert paths(d) == {"projects.0.tasks.0.estimatedHours"}
    d.projects[0].tasks[0].estimated_hours = None
    assert paths(d) == {"projects.0.tasks.0.estimatedHours"}


def test_all_errors_collected():
    d = good(); p = d.projects[0]
    p.name = " "; p.client_name = ""; p.manager_id = None; p.deadline = "bad"
    assert len(validate_draft(d, users())) == 4
