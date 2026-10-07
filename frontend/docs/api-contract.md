# NovaWorks PM API contract

The frontend talks to the backend only through these endpoints. Requests and responses are JSON. Paths are relative to `VITE_API_BASE_URL` (empty in development, where Vite proxies `/api` to the backend).

## Sessions

The frontend supports either approach, so use whichever suits the backend:

1. Preferred: `POST /api/auth/login` sets an httpOnly session cookie. Every request is sent with `credentials: "include"`.
2. Alternative: `POST /api/auth/login` returns a `token`. The frontend stores it and sends `Authorization: Bearer <token>`.

The backend must work out the current user from the cookie or token only. Never trust a role or user id sent by the client.

If the frontend and backend are on different domains and you use cookies, set `SameSite=None; Secure` on the cookie and allow the frontend origin with credentials in CORS.

## Errors

Every non-2xx response uses this shape. The frontend shows `message` to the user, so write it as a full sentence.

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "The email or password is incorrect." } }
```

A FastAPI `{"detail": "..."}` string is also understood. A 401 from any endpoint other than login and me signs the user out.

## Types

```ts
type Role = 'ADMIN' | 'MANAGER' | 'AGENT';
User         { id, name, email, role, specialization, skills: string[] }   // never include password fields
UserRef      { id, name, role, specialization }
Task         { id, projectId, title, description, assigneeId, assignee: UserRef | null, deadline: 'YYYY-MM-DD', estimatedHours: number }
ProjectSummary { id, name, clientName, description, managerId, manager: UserRef | null, deadline: 'YYYY-MM-DD', taskCount, totalHours, createdAt? }
ProjectDetail  = ProjectSummary & { tasks: Task[] }
```

`taskCount`, `totalHours`, and `tasks` only include what the current user may see. For an agent that is their own tasks.

## Endpoints

| Method | Path | Who | Success response |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | anyone | `200 { user, token? }`, or 401 |
| POST | `/api/auth/logout` | signed in | `204` |
| GET | `/api/auth/me` | anyone | `200 { user }`, or 401 when signed out |
| GET | `/api/team` | signed in | `200 { users: User[] }` |
| GET | `/api/projects` | signed in | `200 { projects: ProjectSummary[] }` |
| GET | `/api/projects?include=tasks` | signed in | `200 { projects: ProjectDetail[] }` (home board) |
| GET | `/api/projects/:id` | signed in | `200 { project: ProjectDetail }`, 403, or 404 |
| POST | `/api/transcripts/convert` | ADMIN | `201` created, or `422` needs correction |
| POST | `/api/transcripts/commit` | ADMIN | `201` created, or `422` needs correction |

## Access rules (enforce on the server for every request)

```
getProjects(user):
  ADMIN   -> all projects
  MANAGER -> projects where managerId == user.id
  AGENT   -> distinct projects that contain a task assigned to user.id

getTasks(user, project):
  ADMIN   -> all tasks in the project
  MANAGER -> all tasks, only if they manage the project
  AGENT   -> only tasks assigned to them

getProjectById(user, id): 404 if missing, 403 if not in getProjects(user)
transcripts/*: 403 unless ADMIN
```

## Transcript conversion

`POST /api/transcripts/convert` with `{ "transcript": "..." }`.

Send the transcript and the directory (id, name, role, specialization, skills, never passwords) to the LLM. Validate the whole draft. Save every project and task in one transaction only when everything is valid.

Created (`201`):

```json
{ "status": "created", "projects": [ProjectDetail], "totals": { "projects": 3, "tasks": 12, "hours": 124 } }
```

Needs correction (`422`, nothing saved):

```json
{
  "status": "needs_correction",
  "draft": { "projects": [DraftProject] },
  "issues": [{ "path": "projects.2.tasks.2.assigneeId", "message": "Kamran is not in the team directory. Assign an agent." }]
}
```

```ts
DraftProject { name, clientName, description, managerId: string | null, managerName?: string | null, deadline: string | null, tasks: DraftTask[] }
DraftTask    { title, description, assigneeId: string | null, assigneeName?: string | null, deadline: string | null, estimatedHours: number | null }
```

`managerName` and `assigneeName` are optional raw names the AI read. The review screen uses them in messages when an id could not be resolved.

Issue paths: `projects.{p}.{name|clientName|managerId|deadline}`, `projects.{p}.tasks.{t}.{title|assigneeId|deadline|estimatedHours}`, or `projects` for problems with the whole draft.

Other errors: `400 EMPTY_TRANSCRIPT`, `422 NO_PROJECTS_FOUND` (error shape, no draft), `502 AI_UNAVAILABLE` or `AI_INVALID_OUTPUT`, `403 FORBIDDEN`.

`POST /api/transcripts/commit` with `{ "draft": Draft }` receives the admin's corrected draft. Validate it again with the same rules and return the same responses.

## Validation rules

Project: name and clientName required; managerId must be an existing MANAGER; deadline must be a valid `YYYY-MM-DD`.

Task: title required; assigneeId must be an existing AGENT; estimatedHours must be greater than 0; deadline must be valid and on or before the project deadline.

The frontend runs the same rules live in `src/lib/draft-validation.ts`.
