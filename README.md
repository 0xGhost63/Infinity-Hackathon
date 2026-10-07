# NovaWorks Project CRM

AI Project Manager challenge, The Infinity Hack '26. Team: **[TEAM NAME]**.

The administrator pastes a meeting transcript, the AI step turns it into projects and tasks assigned to existing managers and developers, and every user sees only the work that belongs to them.

- Live application: **[LIVE LINK]**
- Demo video: **[VIDEO LINK]**
- Requirements: `prd.md`. Technical design: `architecture.md`.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2, Uvicorn |
| Database | PostgreSQL on Aiven (SQLite fallback for local development) |
| Auth | Server session in a signed HTTP-only cookie, bcrypt password hashes |
| AI | OpenAI, OpenRouter, Groq, Anthropic or Gemini API through one adapter, JSON schema enforced |
| Frontend | React 18, TypeScript, Vite, Tailwind, React Router |
| Deployment | One Docker image serving API and frontend, hosted on **[PLATFORM]** |

## Working features

- Login and logout for the ten seeded demo accounts, no signup.
- Admin dashboard with all project cards and Create from transcript.
- Read-only team directory.
- Projects list and project detail with client, manager, deadline and tasks (title, description, assignee, deadline, estimated hours).
- Manager view limited to their projects. Agent view limited to their tasks and related projects.
- Access rules enforced inside database queries on every API call, not only in the UI.
- Create from transcript: AI extraction with the team directory, full validation, correction form for unresolved values, all-or-nothing save.
- Persistent PostgreSQL storage.

## Setup and run (local)

Prerequisites: Python 3.12, Node 20.

```bash
git clone [REPO URL]
cd novaworks-crm
cp .env.example .env            # fill in the values described below

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed              # creates tables and the ten demo users
uvicorn app.main:app --reload --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173, proxies /api to port 8000
```

API docs are available at `http://localhost:8000/api/docs` while the backend runs. The exact request and response shapes are in `frontend/docs/api-contract.md`.

To run the whole app from one process (what production does): `cd frontend && npm run build`, then start the backend; it serves the built frontend on http://localhost:8000.

## Database setup and seed

1. Create a free PostgreSQL service at https://aiven.io/free-postgresql-database and copy the Service URI.
2. Put it in `.env` as `DATABASE_URL`. The `postgres://` scheme and `?sslmode=require` can stay exactly as Aiven gives them.
3. Run `python -m app.seed` from `backend/`. Tables are created automatically. Running it again updates the ten rows and creates nothing new; the script prints `created N, updated M, total 10`.
4. `python -m app.reset` deletes all projects and tasks and keeps the users. Use it before recording the demo or after test runs.

If `DATABASE_URL` is empty in development, the backend uses a local SQLite file at `backend/dev.db`.

## Environment variables

| Name | Required | Purpose |
|---|---|---|
| `APP_ENV` | yes | `development` or `production` |
| `DATABASE_URL` | production | PostgreSQL connection string (Aiven Service URI) |
| `SESSION_SECRET` | production | Signs the session cookie. Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `LLM_PROVIDER` | yes | `openai`, `openrouter`, `groq`, `anthropic` or `gemini` (`mock` is for frontend development only) |
| `LLM_API_KEY` | yes | Provider API key |
| `LLM_MODEL` | yes | Exact model name from the provider |
| `LLM_BASE_URL` | no | Alternative OpenAI-compatible host (Groq, OpenRouter) |
| `LLM_TIMEOUT_SECONDS` | no | Default 120 |
| `FRONTEND_DIST` | no | Path to the built frontend, default `../frontend/dist` |
| `PORT` | no | Default 8000 |

`.env.example` lists them with placeholders. Real keys and database passwords are never committed.

## Demo accounts

Password for every account: `Demo123!`

| Role | Name | Email |
|---|---|---|
| Administrator | Admin | admin@novaworks.example |
| Manager (Web) | Ayesha Khan | ayesha@novaworks.example |
| Manager (Mobile) | Bilal Ahmed | bilal@novaworks.example |
| Manager (AI) | Hina Malik | hina@novaworks.example |
| Agent | Ali Raza | ali@novaworks.example |
| Agent | Hamza Shah | hamza@novaworks.example |
| Agent | Sara Noor | sara@novaworks.example |
| Agent | Usman Tariq | usman@novaworks.example |
| Agent | Zain Abbas | zain@novaworks.example |
| Agent | Maryam Asif | maryam@novaworks.example |

## Transcript testing steps

1. Log in as `admin@novaworks.example`.
2. Open Create from transcript and paste the full meeting transcript (`backend/tests/fixtures/transcript.txt` holds the supplied one).
3. Click Create from transcript. Processing takes up to about 60 seconds.
4. Expected result: three projects and twelve tasks. UrbanCart Website (Ayesha, 2026-10-20, 40 h), QuickServe Mobile App (Bilal, 2026-10-24, 46 h), HelpDeskPro AI Assistant (Hina, 2026-10-22, 38 h).
5. Log in as Ayesha to see only UrbanCart; as Ali to see only his three tasks; as Hamza to see two tasks across two projects. Opening another user's project URL shows an access message, and calling `/api/projects/{id}` directly returns 403 (404 when the id does not exist).
6. Changed-input test: `backend/tests/fixtures/transcript_changed.txt` sets Mobile integration and testing to 12 hours and 2026-10-23. Only that task changes.
7. Correction flow: give a task to a person who is not in the directory. The AI leaves the assignee empty, the server returns the draft with the field marked, and the administrator picks the right person before anything is saved.

Automated checks from `backend/`:

```bash
python -m pytest -q                              # 21 tests: validation, access control, atomic save, provider adapters
python scripts/eval_transcript.py --runs 3       # real AI run diffed against the answer key
python scripts/eval_transcript.py --changed      # changed-input test
```

## Deployment

Platform: **[PLATFORM, for example Render]**. Database: Aiven PostgreSQL.

1. Create the Aiven PostgreSQL service and copy the Service URI.
2. Create a web service from this repository using the root `Dockerfile`. The image builds the frontend and runs `uvicorn app.main:app`, which serves `/api` and the frontend from one origin.
3. Set the environment variables above with `APP_ENV=production`.
4. From a laptop with `DATABASE_URL` pointing at Aiven, run `python -m app.seed` once.
5. Open the live link and log in with a demo account.

Without Docker, the equivalent build command is `cd frontend && npm ci && npm run build && cd ../backend && pip install -r requirements.txt` and the start command is `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

## Known limitations

- Submitting the same transcript twice creates a second set of projects on purpose. `python -m app.reset` clears all projects and tasks.
- Projects and tasks cannot be edited or deleted from the interface.
- Free hosting tiers may sleep when idle; the first request after a pause can take 30 to 60 seconds.
- The AI step depends on the provider's availability. If it fails, the application reports it and saves nothing.
