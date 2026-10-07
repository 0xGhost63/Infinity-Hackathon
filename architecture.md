# NovaWorks Project CRM

## Architecture Document

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-10-07 |
| Companion | `prd.md` (requirements and acceptance criteria) |
| Status | Approved for build |

## 1. Overview

One web service. FastAPI serves the JSON API under `/api` and the compiled React application for every other path. PostgreSQL on Aiven stores users, projects and tasks. An LLM provider is called only from the transcript endpoints.

```mermaid
flowchart LR
  B[Browser: React app] -->|HTTPS, session cookie| A[FastAPI service]
  A -->|static files| B
  A -->|SQLAlchemy over SSL| P[(PostgreSQL on Aiven)]
  A -->|HTTPS, JSON schema| L[LLM provider]
```

Why this shape:

- One origin for frontend and API. Session cookies work without CORS or cross-site cookie settings, both locally and in production.
- A long-running process instead of serverless functions. The AI step takes 20 to 60 seconds and must not hit a function timeout.
- Three tables and no migration tooling. `Base.metadata.create_all()` at startup is enough for a three-hour build.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | Python 3.12, FastAPI, Uvicorn | The AI endpoint is a sync `def`, so it runs in the thread pool and never blocks the event loop |
| ORM | SQLAlchemy 2.0, psycopg 3 | Connection URL uses `postgresql+psycopg://` with `sslmode=require` |
| Database | PostgreSQL on Aiven free tier | Any PostgreSQL 14 or newer works |
| Auth | Starlette `SessionMiddleware`, `bcrypt` | Signed HTTP-only cookie holding the user ID |
| Validation | Pydantic v2 | Request bodies, response models and the AI draft schema |
| AI | Provider SDK behind one adapter function | JSON schema enforced, temperature 0, 120 s timeout, one retry |
| Frontend | React 18, TypeScript, Vite, Tailwind, React Router with `HashRouter` | Built to `frontend/dist` and served by FastAPI |
| Hosting | Render, Railway or Fly.io web service | Docker image builds the frontend and runs Uvicorn |

## 3. Repository layout

```text
novaworks-crm/
  README.md
  .env.example
  prd.md
  architecture.md
  Dockerfile
  backend/
    requirements.txt
    app/
      __init__.py
      main.py              FastAPI app, middleware, routers, static mount
      config.py            Settings read from environment variables
      db.py                Engine, SessionLocal, Base, get_db dependency
      models.py            User, Project, Task
      schemas.py           Pydantic request and response models
      security.py          Password hashing and verification
      deps.py              get_current_user, require_admin
      access.py            project_scope, task_scope
      routers/
        auth.py            /api/auth/login, /api/auth/logout, /api/me
        users.py           /api/users
        projects.py        /api/projects, /api/projects/{id}, /api/my-tasks
        transcript.py      /api/transcript, /api/transcript/confirm
      ai/
        prompt.py          System prompt text
        schema.py          Draft, ProjectDraft, TaskDraft
        extract.py         extract_draft(transcript, directory)
        validate.py        validate_draft(draft, users_by_id)
        save.py            save_draft(engine, draft)
      seed.py              python -m app.seed
      reset.py             python -m app.reset
    scripts/
      eval_transcript.py   Runs extraction and diffs the result against the fixture
    tests/
      fixtures/
        transcript.txt
        transcript_changed.txt
        expected.json
      test_validate.py
  frontend/
    index.html
    package.json
    vite.config.ts
    src/
      main.tsx
      App.tsx              Router, route guards, layout
      index.css            Design tokens and base styles
      api/client.ts        fetch wrapper and typed API functions
      api/types.ts         Response types shared by pages
      auth/AuthProvider.tsx
      components/          TopBar, Button, Panel, Badge, DataTable, Field, Alert, ProgressBar, EmptyState
      pages/               LoginPage, DashboardPage, ProjectsPage, ProjectDetailPage, MyTasksPage, TeamPage, TranscriptPage, NotFoundPage
      features/transcript/ DraftEditor.tsx, ResultSummary.tsx
```

## 4. Backend

### 4.1 Configuration

`app/config.py` reads these variables once at startup and fails fast if a required one is missing.

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@host:port/db?sslmode=require` | Database connection |
| `SESSION_SECRET` | 64 random hex characters | Signs the session cookie |
| `APP_ENV` | `development` or `production` | Turns on `https_only` cookies in production |
| `LLM_PROVIDER` | `openai`, `anthropic` or `gemini` | Selects the SDK used in `ai/extract.py` |
| `LLM_API_KEY` | secret | Provider key |
| `LLM_MODEL` | model name | Model used for extraction |
| `FRONTEND_DIST` | `../frontend/dist` | Directory of the built frontend |
| `PORT` | `8000` | Listening port |

Aiven's service URI starts with `postgres://`, which SQLAlchemy rejects. The README tells the team to change the scheme to `postgresql+psycopg://` and keep `?sslmode=require`.

### 4.2 Data model

```mermaid
erDiagram
  USERS ||--o{ PROJECTS : manages
  USERS ||--o{ TASKS : "is assigned"
  PROJECTS ||--o{ TASKS : contains
  USERS {
    string id PK
    string name
    string email UK
    string password_hash
    string role
    string specialization
    text skills
  }
  PROJECTS {
    string id PK
    string name
    string client_name
    text description
    string manager_id FK
    date deadline
    timestamp created_at
  }
  TASKS {
    string id PK
    string project_id FK
    string title
    text description
    string assignee_id FK
    date deadline
    numeric estimated_hours
    timestamp created_at
  }
```

SQLAlchemy sketch (`app/models.py`):

```python
class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    AGENT = "AGENT"

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)   # ADMIN, PM01..PM03, DEV01..DEV06
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"))
    specialization: Mapped[str] = mapped_column(String(120))
    skills: Mapped[list[str]] = mapped_column(ARRAY(String))

class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200))
    client_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    manager_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    deadline: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    manager: Mapped["User"] = relationship()
    tasks: Mapped[list["Task"]] = relationship(back_populates="project", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (CheckConstraint("estimated_hours > 0", name="task_hours_positive"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    assignee_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    deadline: Mapped[date] = mapped_column(Date)
    estimated_hours: Mapped[float] = mapped_column(Numeric(6, 1))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    project: Mapped["Project"] = relationship(back_populates="tasks")
    assignee: Mapped["User"] = relationship()
```

Decisions:

- `users.id` is the reference code from the brief. The AI returns these codes, the validator checks them and the save step stores them directly, with no mapping table.
- Role constraints (a manager must be a MANAGER, an assignee must be an AGENT) are enforced by the validator, because a foreign key cannot check a role.
- Deadlines are `DATE` columns. Pydantic serializes them as `YYYY-MM-DD` strings and the frontend displays the string as is. No value is ever passed through JavaScript `Date`.
- Project and task IDs are UUID strings generated by the application.

### 4.3 Authentication and sessions

```python
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="novaworks_session",
    same_site="lax",
    https_only=settings.app_env == "production",
    max_age=7 * 24 * 3600,
)
```

Flow:

1. `POST /api/auth/login` loads the user by email and checks the password with `bcrypt.checkpw`. On success it sets `request.session["user_id"] = user.id` and returns the current user. On failure it returns 401 with "Invalid email or password" for both wrong email and wrong password.
2. Every protected endpoint depends on `get_current_user`, which reads `user_id` from the session, loads the user from the database and raises 401 when either is missing.
3. `require_admin` builds on `get_current_user` and raises 403 for any other role.
4. `POST /api/auth/logout` clears the session and returns 204.

```python
def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=401, detail="Log in to continue")
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Only the administrator can do this")
    return user
```

Nothing about the caller's identity is ever read from the request body, query string or headers.

### 4.4 Access scoping

All scoping lives in `app/access.py`. Every read endpoint builds its query through these two functions.

```python
def project_scope(user: User) -> Select:
    q = select(Project)
    if user.role == Role.MANAGER:
        q = q.where(Project.manager_id == user.id)
    elif user.role == Role.AGENT:
        q = q.where(Project.tasks.any(Task.assignee_id == user.id))
    return q  # ADMIN sees everything

def task_scope(user: User, project_id: str) -> Select:
    q = select(Task).where(Task.project_id == project_id)
    if user.role == Role.AGENT:
        q = q.where(Task.assignee_id == user.id)
    return q
```

Rules that follow from this:

- `GET /api/projects/{id}` resolves the project with `project_scope(user).where(Project.id == id)`. An empty result returns 404 whether the project is missing or simply not the caller's.
- A manager only reaches a project through `project_scope`, so `task_scope` returning every task in that project is safe.
- An agent sees the project header (name, client, manager, deadline, description) and only their own tasks. Task counts and total hours on summaries are computed over the scoped tasks, so an agent never learns how much other work a project contains.
- The team directory (`GET /api/users`) is readable by every signed-in user and returns no emails or password hashes.

### 4.5 API contract

Note: the implemented contract is the one in `frontend/docs/api-contract.md` (`/api/auth/me`, `/api/team`, `{projects: [...]}` envelopes, `/api/transcripts/convert` and `/commit`, `status: "needs_correction"` with dotted issue paths, and 403 for a project outside the caller's scope). The table below was the original design and is kept for reference.

All bodies are JSON with camelCase keys. Pydantic models use `alias_generator=to_camel` with `populate_by_name=True`.

| Method | Path | Who | Request | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | anyone | `{email, password}` | 200 `MeOut` | 401 |
| POST | `/api/auth/logout` | signed in | none | 204 | 401 |
| GET | `/api/me` | signed in | none | 200 `MeOut` | 401 |
| GET | `/api/users` | signed in | none | 200 `UserOut[]` | 401 |
| GET | `/api/projects` | signed in | none | 200 `ProjectSummary[]`, scoped | 401 |
| GET | `/api/projects/{id}` | signed in | none | 200 `ProjectDetail`, tasks scoped | 401, 404 |
| GET | `/api/my-tasks` | signed in | none | 200 `TaskWithProject[]`, assigned to the caller | 401 |
| POST | `/api/transcript` | ADMIN | `{transcript}` | 201 `CreateResult` | 400 empty text, 401, 403, 422 `DraftErrors`, 502 AI failure |
| POST | `/api/transcript/confirm` | ADMIN | `{draft}` | 201 `CreateResult` | 400, 401, 403, 422 `DraftErrors` |

Response types, written as TypeScript for clarity (`frontend/src/api/types.ts` mirrors these):

```ts
type Role = "ADMIN" | "MANAGER" | "AGENT";

type UserOut = { id: string; name: string; role: Role; specialization: string; skills: string[] };
type MeOut = UserOut & { email: string };
type PersonRef = { id: string; name: string; specialization: string };

type ProjectSummary = {
  id: string; name: string; clientName: string; deadline: string;
  manager: PersonRef; taskCount: number; totalHours: number;
};
type TaskOut = {
  id: string; projectId: string; title: string; description: string;
  assignee: PersonRef; deadline: string; estimatedHours: number;
};
type ProjectDetail = {
  id: string; name: string; clientName: string; description: string; deadline: string;
  manager: PersonRef; tasks: TaskOut[]; totalHours: number;
};
type TaskWithProject = TaskOut & {
  project: { id: string; name: string; clientName: string; deadline: string; manager: PersonRef };
};

type TaskDraft = {
  title: string; description: string; assigneeId: string | null;
  deadline: string | null; estimatedHours: number | null;
};
type ProjectDraft = {
  name: string; clientName: string; description: string; managerId: string | null;
  deadline: string | null; tasks: TaskDraft[];
};
type Draft = { projects: ProjectDraft[]; issues: string[] };

type FieldError = { path: string; message: string };          // path: projects[1].tasks[3].assigneeId
type DraftErrors = { draft: Draft; errors: FieldError[]; issues: string[] };
type CreateResult = {
  projects: { id: string; name: string; clientName: string; taskCount: number; totalHours: number }[];
  totals: { projects: number; tasks: number; hours: number };
  issues: string[];
};
```

Error conventions:

- `HTTPException` responses have the shape `{detail: "message"}`. Messages are written for the screen and shown as they are.
- Draft validation returns 422 with the `DraftErrors` shape. FastAPI also uses 422 for malformed request bodies with a `detail` array, so the frontend treats a 422 as a correction only when the body contains `draft`.
- AI failures return 502 with "The AI step failed and nothing was saved. Try again."

### 4.6 Transcript pipeline

```mermaid
sequenceDiagram
  participant UI as Transcript page
  participant API as POST /api/transcript
  participant AI as LLM provider
  participant DB as PostgreSQL
  UI->>API: {transcript}
  API->>API: require_admin, reject empty text (400)
  API->>DB: load directory (managers and agents)
  API->>AI: system prompt + directory + transcript, JSON schema
  AI-->>API: Draft JSON
  API->>API: parse, retry once on failure (502 after second failure)
  API->>API: validate_draft
  alt errors
    API-->>UI: 422 {draft, errors, issues}
  else valid
    API->>DB: BEGIN, insert projects and tasks, COMMIT
    API-->>UI: 201 CreateResult
  end
```

#### extract.py

`extract_draft(transcript: str, directory: list[dict]) -> Draft`

- The directory contains only `id, name, role, specialization, skills` for every MANAGER and AGENT. Emails and password hashes never leave the database.
- The JSON schema is `Draft.model_json_schema()` and is passed to the provider's structured-output or tool-calling mode. The reply is parsed with `Draft.model_validate_json()`.
- Temperature 0 where the model supports it. Request timeout 120 seconds.
- On a parse or schema failure the call is repeated once with the error message appended to the user message. A second failure raises `AIExtractionError`, which the router turns into a 502.
- The system prompt is generic. It contains no names, dates or facts from the supplied transcript.

```text
You convert a project-planning meeting transcript into projects and tasks for a
project-management CRM. Return only JSON that matches the schema.

Rules:
1. Final decisions win. If a deadline, estimate, owner or scope changes later in
   the meeting, use the last agreed value. A closing recap is authoritative.
2. Create one project per client engagement the meeting agrees to deliver.
   Discussion of internal tools or process is not a project. Never merge or split
   projects or tasks beyond what was agreed: two tasks with one owner stay two.
3. Leave out anything rejected, excluded or deferred to future work. Create no
   tasks for it; you may mention the exclusion in the project description.
4. Use only people from TEAM DIRECTORY, referenced by id. managerId must be a
   MANAGER and assigneeId an AGENT. Never invent people. Clients, end users and
   external contacts are never managers or assignees.
5. estimatedHours is the developer effort stated in the meeting, not calendar
   days. Do not create management or meeting tasks.
6. Dates are YYYY-MM-DD. If no year is stated, use the meeting's year.
7. Use the project and task names agreed in the meeting. One-sentence descriptions.
8. If a required value (manager, assignee, deadline, hours) is missing or
   ambiguous, set it to null and explain in "issues". Never guess.
```

The user message is `TEAM DIRECTORY:` followed by the directory as JSON, then `TRANSCRIPT:` followed by the full pasted text.

#### validate.py

`validate_draft(draft: Draft, users_by_id: dict[str, User]) -> list[FieldError]` collects every problem instead of stopping at the first one.

```python
def validate_draft(draft, users):
    errors = []
    if not draft.projects:
        errors.append(FieldError("projects", "Add at least one project"))
    for i, p in enumerate(draft.projects):
        base = f"projects[{i}]"
        require_text(errors, f"{base}.name", p.name, "Enter a project name")
        require_text(errors, f"{base}.client_name", p.client_name, "Enter a client name")
        require_person(errors, f"{base}.manager_id", p.manager_id, users, Role.MANAGER,
                       "Choose a manager from the team directory")
        project_date = require_date(errors, f"{base}.deadline", p.deadline, "Enter a valid deadline")
        for j, t in enumerate(p.tasks):
            tb = f"{base}.tasks[{j}]"
            require_text(errors, f"{tb}.title", t.title, "Enter a task title")
            require_person(errors, f"{tb}.assignee_id", t.assignee_id, users, Role.AGENT,
                           "Choose an agent from the team directory")
            task_date = require_date(errors, f"{tb}.deadline", t.deadline, "Enter a valid deadline")
            if task_date and project_date and task_date > project_date:
                errors.append(FieldError(f"{tb}.deadline",
                                         "Task deadline must be on or before the project deadline"))
            if t.estimated_hours is None or t.estimated_hours <= 0:
                errors.append(FieldError(f"{tb}.estimated_hours", "Enter the estimated hours"))
    return errors
```

Helpers: `require_text` rejects empty or whitespace-only strings. `require_person` checks that the ID exists and has the required role. `require_date` checks the `^\d{4}-\d{2}-\d{2}$` pattern and then `date.fromisoformat`, which also rejects impossible dates such as 2026-02-30, and returns the parsed date so the task-versus-project comparison uses real dates. Paths are converted to camelCase before they are returned so they match the JSON the frontend holds.

#### save.py

`save_draft(engine, draft: Draft) -> CreateResult`

```python
def save_draft(engine, draft):
    with Session(engine) as db, db.begin():
        projects = [
            Project(
                name=p.name, client_name=p.client_name, description=p.description,
                manager_id=p.manager_id, deadline=date.fromisoformat(p.deadline),
                tasks=[
                    Task(title=t.title, description=t.description, assignee_id=t.assignee_id,
                         deadline=date.fromisoformat(t.deadline), estimated_hours=t.estimated_hours)
                    for t in p.tasks
                ],
            )
            for p in draft.projects
        ]
        db.add_all(projects)
        db.flush()
        return build_create_result(projects)   # built before the transaction closes
```

The `with` block commits when it exits normally and rolls back on any exception, so a failure inside leaves no partial records. The router logs one line per run: user ID, duration, outcome and the counts of projects and tasks created.

#### Router behaviour

- `POST /api/transcript`: `require_admin`, strip the text and return 400 if it is empty, load the directory, call `extract_draft`, call `validate_draft`, then either return 422 with `DraftErrors` or call `save_draft` and return 201.
- `POST /api/transcript/confirm`: `require_admin`, parse the body as `Draft`, then run the same `validate_draft` and `save_draft`. The client's edits are never trusted without this second validation.
- Both endpoints are plain `def` functions so the blocking provider call runs in FastAPI's thread pool.

### 4.7 Seed and reset

`python -m app.seed`

1. Create tables with `Base.metadata.create_all()` if they do not exist.
2. For each of the ten accounts in `SEED_USERS`, select by email. Insert when missing, otherwise update name, role, specialization and skills.
3. Hash `Demo123!` once with `bcrypt.hashpw` and store it on inserted rows.
4. Print `Seed complete: created N, updated M, total 10`.

`python -m app.reset` deletes all tasks and projects inside one transaction and prints the counts removed. Users are untouched.

### 4.8 Static file serving

`app/main.py` includes the API routers first and mounts the frontend last:

```python
app.include_router(api_router, prefix="/api")
app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")
```

The frontend uses hash routing, so every deep link is `/#/...` and resolves to `index.html` without a catch-all route. Refreshing any page works.

## 5. Frontend

### 5.1 Routing and auth state

| Path | Page | Allowed roles |
|---|---|---|
| `/#/login` | LoginPage | signed out (signed-in users are sent to their home) |
| `/#/dashboard` | DashboardPage | ADMIN |
| `/#/projects` | ProjectsPage | MANAGER (ADMIN is sent to the dashboard) |
| `/#/projects/:id` | ProjectDetailPage | all roles, data scoped by the server |
| `/#/my-tasks` | MyTasksPage | AGENT |
| `/#/team` | TeamPage | all roles |
| `/#/transcript` | TranscriptPage | ADMIN |
| anything else | NotFoundPage | all |

`AuthProvider` calls `GET /api/me` once on load and stores `user` or `null`. `RequireAuth` redirects signed-out visitors to `/#/login`. `RequireRole` redirects a signed-in user with the wrong role to their home. These guards improve the experience only; the server is the authority.

Home by role: ADMIN to `/#/dashboard`, MANAGER to `/#/projects`, AGENT to `/#/my-tasks`.

### 5.2 API client

`api/client.ts` wraps `fetch` with `credentials: "same-origin"` and JSON headers, parses the body, and throws `ApiError {status, body}` on non-2xx responses. A 401 outside the login page clears the stored user and redirects to login. Typed functions exist for every endpoint in section 4.5.

### 5.3 Transcript page state machine

| State | Shown | Transition |
|---|---|---|
| idle | Text area, hint "Processing takes up to about 60 seconds", enabled Create from transcript button | Click with non-empty text: working. Click with empty text: inline message, stay idle |
| working | Text area read only, button disabled and labelled "Analyzing transcript", striped progress bar | 201: success. 422 with draft: correction. Anything else: error |
| success | Result summary with created projects, task counts, total hours, AI notes, Open project links, Create another button | Create another: idle |
| correction | AI notes, editable draft form with highlighted fields, Save corrections and Discard buttons | Save corrections: working (confirm endpoint). Discard: idle |
| error | Alert stating nothing was saved, Try again button | Try again: idle with the text preserved |

The submit handler ignores clicks while the state is working, in addition to the disabled attribute.

### 5.4 Design system

The brief pins the style: neo-brutalist, professional, no emojis, no em dashes. The memorable element is the hard-shadow panel with the signal yellow primary button. Everything else stays quiet so the data reads cleanly.

Tokens (`src/index.css`):

```css
:root {
  --black: #000000;        /* borders, text, shadows; never a tinted near-black */
  --white: #FFFFFF;        /* panels, tables, inputs */
  --concrete: #E9E8E2;     /* page background */
  --signal: #FFD60A;       /* primary actions and focus */
  --sky: #8FD3FF;          /* manager badge, information alerts */
  --mint: #B6F2A6;         /* agent badge, success alerts */
  --alarm: #FF6B6B;        /* errors and invalid fields */
  --muted: #4A4A4A;        /* secondary text */

  --border: 3px solid var(--black);
  --shadow: 6px 6px 0 0 var(--black);
  --shadow-sm: 3px 3px 0 0 var(--black);
  --radius: 0px;
  --font: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --space: 8px;            /* every margin and padding is a multiple */
  --content-width: 1200px;
}
```

Typography: one family, Archivo, loaded from Google Fonts with weights 400, 500, 700 and 900. Hierarchy comes from size and weight, never from caps or color.

| Role | Size and weight | Notes |
|---|---|---|
| Page title | 40 px, 900, line-height 1.05, letter-spacing -0.02em | One per page, left aligned |
| Section title | 24 px, 700, line-height 1.15 | |
| Panel title | 20 px, 700 | Project name on cards |
| Body | 15 px, 400, line-height 1.5 | Max 72 characters per line in prose |
| Meta and table header | 13 px, 600, line-height 1.4 | Sentence case |
| Numbers | Same sizes, `font-variant-numeric: tabular-nums` | Dates, hours, counts align in columns |

Components (`src/components`):

| Component | Specification |
|---|---|
| TopBar | White, 3 px black bottom border. Left: wordmark "NovaWorks" at 900 weight with "Project CRM" at 400 beside it. Centre: role-specific links; the active link has a 3 px black underline. Right: user name, role Badge, Log out as a secondary Button. Collapses to two rows under 768 px |
| Button | Height 44 px, padding 0 20 px, 15 px 700 text, 3 px border, `--shadow-sm`. Primary: signal background. Secondary: white background. Danger: alarm background. Hover: translate(-1px, -1px) and 4 px shadow. Active: translate(2px, 2px) and 1 px shadow. Disabled: concrete background, muted text, no shadow, `cursor: not-allowed` |
| Panel | White, 3 px border, `--shadow`, padding 24 px. Cards and detail headers are Panels |
| Badge | Inline, 3 px border, 13 px 700 text, padding 2 px 8 px. ADMIN: black background with white text. MANAGER: sky. AGENT: mint. Always shows the role word, so color is never the only signal |
| DataTable | Inside a Panel with zero padding. 3 px black header rule, 2 px row rules, 13 px 600 header text, 15 px body text, 12 px 16 px cell padding, right-aligned numeric columns, an optional total row in 700 weight. Wrapped in `overflow-x: auto` |
| Field | Label above the control at 13 px 600. Inputs, selects and text areas: white, 3 px border, 44 px height (text areas taller), 15 px text. Focus: 3 px signal outline with 2 px offset. Invalid: alarm border and a 13 px message below in black |
| Alert | 3 px border, 12 px black left rule, padding 16 px. Success: mint. Error: alarm. Information: sky. Text only, no icons |
| ProgressBar | 16 px tall, 3 px border, repeating diagonal stripes of black and signal (24 px period) moving left to right. Static under `prefers-reduced-motion` |
| EmptyState | Panel with one sentence and at most one Button |

Copy rules enforced in review:

- No emojis in any string, including loading, empty and error states.
- No em dashes or en dashes. Use commas, colons, periods or "to".
- Sentence case everywhere. No all-caps labels, no eyebrow labels above headings, no arrows appended to links or buttons, no middle dots between meta values.
- Buttons name their action and keep the same name through the flow: Log in, Log out, Create from transcript, Save corrections, Discard, Open project, Try again, Create another.
- Dates are shown as `YYYY-MM-DD`. Hours are shown as "12 h". Counts are plain numbers.
- Errors say what happened and what to do next, in one or two sentences, without apology.

### 5.5 Screen layouts

Dashboard (admin), desktop width:

```text
+------------------------------------------------------------------------------+
| NovaWorks Project CRM    Dashboard  Create from transcript  Team   Admin [ADMIN] Log out |
+------------------------------------------------------------------------------+
|                                                                              |
|  Projects                                        [ Create from transcript ]  |
|                                                                              |
|  +------------------+  +------------------+  +------------------+            |
|  | 3                |  | 12               |  | 124 h            |            |
|  | projects         |  | tasks            |  | estimated        |            |
|  +------------------+  +------------------+  +------------------+            |
|                                                                              |
|  +----------------------+  +----------------------+  +----------------------+|
|  | UrbanCart Website    |  | QuickServe Mobile App|  | HelpDeskPro AI Asst. ||
|  | UrbanCart Clothing   |  | QuickServe Services  |  | HelpDeskPro Solutions||
|  | Ayesha Khan [MANAGER]|  | Bilal Ahmed [MANAGER]|  | Hina Malik [MANAGER] ||
|  | Deadline 2026-10-20  |  | Deadline 2026-10-24  |  | Deadline 2026-10-22  ||
|  | 4 tasks     40 h     |  | 4 tasks     46 h     |  | 4 tasks     38 h     ||
|  | [ Open project ]     |  | [ Open project ]     |  | [ Open project ]     ||
|  +----------------------+  +----------------------+  +----------------------+|
+------------------------------------------------------------------------------+
```

Project detail:

```text
|  UrbanCart Website                                                           |
|  +------------------------------------------------------------------------+  |
|  | Client UrbanCart Clothing      Manager Ayesha Khan, Web PM             |  |
|  | Deadline 2026-10-20                                                    |  |
|  | Responsive website with product browsing, product details and a demo   |  |
|  | cart. Real payments and inventory integration are excluded.            |  |
|  +------------------------------------------------------------------------+  |
|                                                                              |
|  Tasks                                                                       |
|  +------------------------------------------------------------------------+  |
|  | Title                     | Description      | Assignee  | Deadline   | Hours |
|  |===========================|==================|===========|============|=======|
|  | Product catalog UI        | Listing, detail..| Ali Raza  | 2026-10-12 |  12 h |
|  | Demo cart UI              | Add, remove, ... | Ali Raza  | 2026-10-15 |   8 h |
|  | Product and cart APIs     | Product data ... | Hamza Shah| 2026-10-14 |  14 h |
|  | Website integration and.. | Connect screens..| Ali Raza  | 2026-10-19 |   6 h |
|  |---------------------------|------------------|-----------|------------|-------|
|  | Total                     |                  |           |            |  40 h |
|  +------------------------------------------------------------------------+  |
```

Create from transcript, working and correction states:

```text
|  Create from transcript                                                      |
|  Paste the full meeting transcript. Processing takes up to about 60 seconds. |
|  +------------------------------------------------------------------------+  |
|  | Meeting: NovaWorks Client Delivery Planning ...               (read only)|  |
|  |                                                                        |  |
|  +------------------------------------------------------------------------+  |
|  [ Analyzing transcript ]  (disabled)                                        |
|  [////////////////////////////////////////////////////]  striped bar         |

|  Some values need your attention                                             |
|  Note from the AI: Kamran was mentioned but is not in the team directory.    |
|  +------------------------------------------------------------------------+  |
|  | HelpDeskPro AI Assistant                                               |  |
|  | Client [HelpDeskPro Solutions]  Manager [Hina Malik v]  Deadline [2026-10-22] |
|  |  Task                      Assignee              Deadline     Hours    |  |
|  |  Human escalation flow     [Choose an agent  v]  [2026-10-18] [6]      |  |
|  |                            Choose an agent from the team directory     |  |
|  +------------------------------------------------------------------------+  |
|  [ Save corrections ]   [ Discard ]                                          |
```

Login: concrete background, one centred Panel 420 px wide with the wordmark, the email and password Fields, the primary Log in button, and below it a second Panel titled "Demo accounts" listing the ten names with role Badges. Clicking a row fills the form.

### 5.6 Responsiveness and accessibility

- Layout is fluid from 360 px. Card grids use three columns above 1024 px, two above 640 px, otherwise one. Tables keep their columns and scroll inside their bordered container.
- Every control has a visible focus style (signal outline). Every input has a `<label>`. Buttons are real `<button>` elements and links are real `<a>` elements.
- Contrast: black text on white, concrete, signal, sky and mint all exceed WCAG AA for body text. Muted text is used only at 15 px and above.
- Motion: button press offsets, the progress bar and the result panel reveal are the only animations. All are disabled under `prefers-reduced-motion: reduce`.

## 6. Security model

| Concern | Handling |
|---|---|
| Passwords | bcrypt hashes with a per-password salt. Plain passwords exist only in the seed script and the login request body |
| Session | Signed, HTTP-only, SameSite=Lax cookie. `Secure` in production. Holds only the user ID; the user is reloaded from the database on every request |
| Identity | Always from the session. Request-supplied roles or IDs are ignored by design |
| Authorization | Scope applied inside database queries (section 4.4) and `require_admin` on the transcript endpoints |
| Data exposure | Response models whitelist fields. Password hashes and emails are never returned by list endpoints. The AI receives id, name, role, specialization and skills only |
| Secrets | Environment variables only. `.env` is git-ignored. `.env.example` holds placeholders |
| Input handling | Pydantic validates every body. The transcript is treated as untrusted text and only ever sent to the provider inside a delimited section of the user message |
| Integrity | Transactional save, positive-hours check constraint, foreign keys on manager and assignee |

## 7. Deployment

### 7.1 Build and run

`Dockerfile` at the repository root builds the frontend and runs the API from one image:

```dockerfile
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /web/dist frontend/dist
WORKDIR /app/backend
ENV FRONTEND_DIST=../frontend/dist
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

On a host that builds natively instead of from Docker, the equivalent commands are a build step of `cd frontend && npm ci && npm run build && cd ../backend && pip install -r requirements.txt` and a start command of `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

### 7.2 Hosting steps

1. Create the Aiven PostgreSQL service and copy the service URI. Change the scheme to `postgresql+psycopg://` and keep `?sslmode=require`.
2. Create a web service on Render, Railway or Fly.io from the GitHub repository using the Dockerfile.
3. Set the environment variables from section 4.1. `APP_ENV=production`.
4. From a laptop, run `python -m app.seed` with `DATABASE_URL` pointing at Aiven. This creates the tables and the ten users.
5. Open the live link, log in as each role, run the transcript once.
6. Confirm the host does not cut requests at 30 seconds. The AI endpoint needs up to 60 seconds.
7. Free tiers may sleep when idle. Open the link a minute before judging and note cold starts under Known limitations in the README.

### 7.3 Local development

```text
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env     # fill in values
uvicorn app.main:app --reload --port 8000

cd frontend
npm install
npm run dev                     # http://localhost:5173
```

`vite.config.ts` proxies the API so the session cookie stays first-party in development:

```ts
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
```

The team shares the Aiven database during the hackathon. Anyone running `python -m app.reset` announces it first.

## 8. Testing and verification

| Check | How | Owner |
|---|---|---|
| Answer-key match | `python scripts/eval_transcript.py` runs `extract_draft` on `tests/fixtures/transcript.txt` and diffs every project and task (owner, deadline, hours) against `expected.json`, which holds the 12 rows from `prd.md` section 10. Non-zero exit on any difference. Run four times before the demo | AI teammate |
| Changed input | The same script with `transcript_changed.txt` (Mobile integration and testing at 12 h, 2026-10-23). Only that task may differ | AI teammate |
| Unresolved person | A transcript variant naming someone outside the directory as an owner. Expected: that `assigneeId` is null, an issue explains it, the API returns 422 and nothing is saved | AI teammate |
| Validator unit tests | `pytest tests/test_validate.py` covers each rule in `prd.md` section 7 | Backend |
| Seed idempotency | Run the seed twice; the second run prints created 0, updated 10 | Backend |
| Access control | `curl` with a cookie jar: log in as Ali, request QuickServe's project ID (expect 404), post to `/api/transcript` (expect 403). Log in as Ayesha, request HelpDeskPro's ID (expect 404) | Backend |
| Atomic save | Temporarily make one task invalid at the database level (hours 0 bypassing validation) and confirm no project row remains after the failed request | Backend |
| Demo script | The nine steps in `prd.md` section 10, performed on the live link before recording | Deploy teammate |

Example access checks:

```text
curl -c jar.txt -H "Content-Type: application/json" \
  -d '{"email":"ali@novaworks.example","password":"Demo123!"}' \
  http://localhost:8000/api/auth/login

curl -i -b jar.txt http://localhost:8000/api/projects/<quickserve-id>      # expect 404
curl -i -b jar.txt -H "Content-Type: application/json" -d '{"transcript":"x"}' \
  http://localhost:8000/api/transcript                                      # expect 403
```

## 9. Known limitations

- Submitting the same transcript twice creates a second set of projects. This is intentional for the hackathon; `python -m app.reset` clears all projects and tasks.
- No editing or deleting of projects and tasks from the interface.
- No rate limiting on the AI endpoint beyond the disabled button and the admin-only check.
- One shared database for development and demo.
- Free hosting tiers may take 30 to 60 seconds to wake after idle time.
- AI output is validated structurally and against the directory, but the content of titles and descriptions is taken from the model as returned.
