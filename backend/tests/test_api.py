import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.reset import reset_projects
from app.seed import seed_demo_users

FIXTURES = Path(__file__).resolve().parent / "fixtures"
TRANSCRIPT = (FIXTURES / "transcript.txt").read_text()
PASSWORD = "Demo123!"


@pytest.fixture(scope="module", autouse=True)
def seeded():
    created, updated, total = seed_demo_users()
    assert total == 10
    assert seed_demo_users() == (0, 10, 10), "re-seeding must not duplicate users"
    reset_projects()


def client_for(email: str | None = None) -> TestClient:
    c = TestClient(app)
    if email:
        r = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert r.status_code == 200, r.text
    return c


def test_login_me_logout_and_error_shape():
    c = TestClient(app)
    r = c.get("/api/auth/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHENTICATED" and "detail" in r.json()
    r = c.post("/api/auth/login", json={"email": "admin@novaworks.example", "password": "wrong"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert c.post("/api/auth/login", json={"email": "nobody@novaworks.example", "password": PASSWORD}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "x"}).status_code == 400
    r = c.post("/api/auth/login", json={"email": "ADMIN@novaworks.example", "password": PASSWORD})
    assert r.status_code == 200
    user = r.json()["user"]
    assert user["id"] == "ADMIN" and user["role"] == "ADMIN" and user["email"] == "admin@novaworks.example"
    assert "passwordHash" not in user and "password_hash" not in user
    assert c.get("/api/auth/me").json()["user"]["id"] == "ADMIN"
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401


def test_team_visible_to_everyone_without_secrets():
    r = client_for("ali@novaworks.example").get("/api/team")
    assert r.status_code == 200
    users = r.json()["users"]
    assert len(users) == 10 and users[0]["id"] == "ADMIN" and users[1]["role"] == "MANAGER"
    assert all("passwordHash" not in u and "email" in u for u in users)


def test_transcript_requires_admin_and_text():
    assert client_for("ayesha@novaworks.example").post("/api/transcripts/convert", json={"transcript": TRANSCRIPT}).status_code == 403
    assert client_for("ali@novaworks.example").post("/api/transcripts/commit", json={"draft": {"projects": []}}).status_code == 403
    assert client_for().post("/api/transcripts/convert", json={"transcript": TRANSCRIPT}).status_code == 401
    r = client_for("admin@novaworks.example").post("/api/transcripts/convert", json={"transcript": "   "})
    assert r.status_code == 400 and r.json()["error"]["code"] == "EMPTY_TRANSCRIPT"
    r = client_for("admin@novaworks.example").post("/api/transcripts/commit", json={"draft": {"projects": []}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_PROJECTS_FOUND" and "draft" not in r.json()
    assert client_for("admin@novaworks.example").get("/api/projects").json() == {"projects": []}


def test_convert_and_scoping():
    admin = client_for("admin@novaworks.example")
    r = admin.post("/api/transcripts/convert", json={"transcript": TRANSCRIPT})
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["status"] == "created"
    assert result["totals"] == {"projects": 3, "tasks": 12, "hours": 124.0}
    assert {p["name"]: p["totalHours"] for p in result["projects"]} == {
        "UrbanCart Website": 40.0, "QuickServe Mobile App": 46.0, "HelpDeskPro AI Assistant": 38.0}
    assert len(result["projects"][0]["tasks"]) == 4 and result["projects"][0]["tasks"][0]["assignee"]["role"] == "AGENT"

    projects = admin.get("/api/projects").json()["projects"]
    assert len(projects) == 3 and "tasks" not in projects[0]
    by_name = {p["name"]: p for p in projects}
    urban, quick, help_ = by_name["UrbanCart Website"], by_name["QuickServe Mobile App"], by_name["HelpDeskPro AI Assistant"]
    assert urban["deadline"] == "2026-10-20" and urban["managerId"] == "PM01" and urban["manager"]["name"] == "Ayesha Khan"
    assert urban["taskCount"] == 4 and urban["createdAt"]

    board = admin.get("/api/projects", params={"include": "tasks"}).json()["projects"]
    assert sum(len(p["tasks"]) for p in board) == 12

    detail = admin.get(f"/api/projects/{urban['id']}").json()["project"]
    titles = {t["title"]: t for t in detail["tasks"]}
    assert titles["Website integration and testing"]["deadline"] == "2026-10-19"
    assert titles["Website integration and testing"]["assigneeId"] == "DEV01"
    assert detail["totalHours"] == 40.0

    ayesha = client_for("ayesha@novaworks.example")
    assert [p["name"] for p in ayesha.get("/api/projects").json()["projects"]] == ["UrbanCart Website"]
    assert len(ayesha.get(f"/api/projects/{urban['id']}").json()["project"]["tasks"]) == 4
    assert ayesha.get(f"/api/projects/{quick['id']}").status_code == 403
    assert ayesha.get(f"/api/projects/{help_['id']}").status_code == 403
    assert ayesha.get("/api/projects/does-not-exist").status_code == 404

    ali = client_for("ali@novaworks.example")
    ali_projects = ali.get("/api/projects").json()["projects"]
    assert [p["name"] for p in ali_projects] == ["UrbanCart Website"]
    assert ali_projects[0]["taskCount"] == 3 and ali_projects[0]["totalHours"] == 26.0
    ali_detail = ali.get(f"/api/projects/{urban['id']}").json()["project"]
    assert {t["assigneeId"] for t in ali_detail["tasks"]} == {"DEV01"} and len(ali_detail["tasks"]) == 3
    assert ali.get(f"/api/projects/{quick['id']}").status_code == 403
    ali_board = ali.get("/api/projects", params={"include": "tasks"}).json()["projects"]
    assert len(ali_board) == 1 and len(ali_board[0]["tasks"]) == 3

    hamza = client_for("hamza@novaworks.example")
    hamza_board = hamza.get("/api/projects", params={"include": "tasks"}).json()["projects"]
    assert {p["name"] for p in hamza_board} == {"UrbanCart Website", "QuickServe Mobile App"}
    assert {t["title"] for p in hamza_board for t in p["tasks"]} == {"Product and cart APIs", "Booking and account APIs"}
    assert hamza.get(f"/api/projects/{help_['id']}").status_code == 403


def test_commit_validates_then_saves():
    admin = client_for("admin@novaworks.example")
    draft = json.loads((FIXTURES / "mock_draft.json").read_text())
    draft["projects"] = [draft["projects"][2]]
    draft["projects"][0]["tasks"][2]["assigneeId"] = None
    draft["projects"][0]["tasks"][2]["assigneeName"] = "Kamran"
    draft["projects"][0]["tasks"][3]["deadline"] = "2026-10-30"

    before = len(admin.get("/api/projects").json()["projects"])
    r = admin.post("/api/transcripts/commit", json={"draft": draft})
    assert r.status_code == 422, r.text
    body = r.json()
    assert body["status"] == "needs_correction"
    paths = {i["path"]: i["message"] for i in body["issues"]}
    assert set(paths) == {"projects.0.tasks.2.assigneeId", "projects.0.tasks.3.deadline"}
    assert paths["projects.0.tasks.2.assigneeId"].startswith("Kamran is not in the team directory")
    assert body["draft"]["projects"][0]["tasks"][2]["assigneeName"] == "Kamran"
    assert len(admin.get("/api/projects").json()["projects"]) == before

    draft["projects"][0]["tasks"][2]["assigneeId"] = "DEV05"
    draft["projects"][0]["tasks"][3]["deadline"] = "2026-10-21"
    r = admin.post("/api/transcripts/commit", json={"draft": draft})
    assert r.status_code == 201, r.text
    assert r.json()["totals"] == {"projects": 1, "tasks": 4, "hours": 38.0}
    assert len(admin.get("/api/projects").json()["projects"]) == before + 1


def test_identity_cannot_be_supplied_by_client():
    ali = client_for("ali@novaworks.example")
    r = ali.get("/api/projects", params={"role": "ADMIN", "userId": "ADMIN"}, headers={"X-User-Id": "ADMIN"})
    assert [p["name"] for p in r.json()["projects"]] == ["UrbanCart Website"]
