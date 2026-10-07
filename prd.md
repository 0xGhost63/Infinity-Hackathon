# NovaWorks Project CRM

## Product Requirements Document

| Field | Value |
|---|---|
| Product | NovaWorks Project CRM (AI Project Manager) |
| Event | The Infinity Hack '26, AI Project Manager challenge |
| Version | 1.0 |
| Date | 2026-10-07 |
| Team size | 4 |
| Build time | 3 hours |
| Status | Approved for build |

## 1. Summary

NovaWorks Technologies (Lahore, Pakistan) builds websites, mobile apps and AI tools for clients. After each planning meeting, someone types every project and task into a tracker by hand. This product replaces that step: the administrator pastes the meeting transcript into the CRM, and an AI step turns it into saved projects and tasks, each assigned to an existing manager or developer with a deadline and an estimated effort in hours. Managers and developers log in and see only the work that belongs to them.

The flow in one line: log in, paste the meeting, create projects and tasks automatically, view saved projects and assigned tasks.

## 2. Goals and non-goals

### Goals

1. A working meeting-to-project flow. The administrator pastes a transcript, clicks Create from transcript, and the application saves real records produced by the AI step.
2. Role-based access enforced on the server. Every data request is filtered by the logged-in user, not only the screens.
3. Accurate extraction. The supplied transcript produces exactly three projects and twelve tasks that match the organizer reference, and a modified transcript produces the modified result.
4. A clear, professional frontend in a neo-brutalist style.
5. Persistent data. Projects and tasks survive a refresh and a server restart.
6. A deployed application with a hosted database, a demo video and a complete README.

### Non-goals

The brief excludes these, and the team will not build them: signup, forgot password, email verification, user management screens, cost calculation, hourly rates, budgets, progress monitoring, charts, timesheets, real email sending and external ticketing integrations. Editing created projects and tasks is optional and will only be built if everything else is done.

## 3. Users and roles

| Role | Accounts | Sees | Can do |
|---|---|---|---|
| Administrator (ADMIN) | 1 | All projects, all tasks, team directory | Create from transcript, correct and confirm drafts |
| Manager (MANAGER) | 3 | Projects they manage and every task inside them, team directory | Read only |
| Agent (AGENT) | 6 | Tasks assigned to them, plus the name, manager and deadline of the related projects, team directory | Read only |

Access rules. These hold for direct API requests, not only for what the screens show.

- The current user is always taken from the login session. A role or user ID supplied by the client is never trusted.
- A manager cannot open a project they do not manage, by URL or by API.
- An agent cannot see another agent's tasks, even inside a project they share.
- Only the administrator can call the transcript endpoints.
- Requests outside a user's scope return 404 for records and 403 for actions.

## 4. Demo accounts

All ten accounts use the password `Demo123!`. They are inserted by a seed script before judging. Running the script again updates the existing rows and creates nothing new. There is no signup, password reset or email verification.

| ID | Name | Email | Role | Specialization | Skills |
|---|---|---|---|---|---|
| ADMIN | Admin | admin@novaworks.example | ADMIN | Administrator | Company overview, transcript creation |
| PM01 | Ayesha Khan | ayesha@novaworks.example | MANAGER | Web PM | Web projects, client coordination |
| PM02 | Bilal Ahmed | bilal@novaworks.example | MANAGER | Mobile PM | Mobile projects, delivery planning |
| PM03 | Hina Malik | hina@novaworks.example | MANAGER | AI PM | AI projects, requirement review |
| DEV01 | Ali Raza | ali@novaworks.example | AGENT | Full-Stack | React, frontend integration |
| DEV02 | Hamza Shah | hamza@novaworks.example | AGENT | Full-Stack | Node.js, databases, APIs |
| DEV03 | Sara Noor | sara@novaworks.example | AGENT | App Developer | Flutter, mobile UI |
| DEV04 | Usman Tariq | usman@novaworks.example | AGENT | App Developer | Flutter, integration, testing |
| DEV05 | Zain Abbas | zain@novaworks.example | AGENT | AI Developer | LLMs, extraction, prompts |
| DEV06 | Maryam Asif | maryam@novaworks.example | AGENT | AI Developer | Retrieval, document processing |

The ID column is the user's primary key in the database and the identifier the AI uses when it assigns people.

## 5. Functional requirements

### FR-1 Login and logout

- The login page accepts email and password and signs in any of the ten demo accounts.
- A wrong email or password shows "Invalid email or password" and nothing else.
- A successful login creates a server session and opens the home screen for the user's role.
- Log out ends the session and returns to the login page.
- The login page lists the demo accounts. Clicking one fills the form; the user still has to click Log in.

### FR-2 Seed script

- `python -m app.seed` creates the ten accounts with hashed passwords, roles, specializations and skills matching section 4.
- Accounts are matched by email. Existing rows are updated and no duplicates are created. The script prints how many rows it created and how many it updated.
- `python -m app.reset` deletes all projects and tasks and keeps the users. It exists so the transcript flow can be run repeatedly during development and before recording the demo.

### FR-3 Role home and navigation

- ADMIN opens the dashboard. MANAGER opens My projects. AGENT opens My tasks.
- The navigation shows only the pages the role can use. Admin: Dashboard, Create from transcript, Team. Manager: My projects, Team. Agent: My tasks, Team.
- Every page shows the logged-in user's name and role, and a Log out button.

### FR-4 Admin dashboard

- Shows a summary strip (number of projects, number of tasks, total estimated hours) and one card per project.
- Each card shows project name, client, manager, deadline, task count and total estimated hours, and links to the project detail.
- A primary button, Create from transcript, is visible at the top of the page.
- When there are no projects, the page shows one sentence explaining that there are none yet, and the Create from transcript button.

### FR-5 Team directory

- A read-only table of all ten people: name, role, specialization and skills.
- Available to every logged-in role. No edit, add or delete actions exist.

### FR-6 Projects list

- Lists the projects the current user may see (section 3) with the same fields as the dashboard cards.
- For agents, the task count and total hours on a card are computed from the agent's own tasks only.

### FR-7 Project detail

- Shows name, client, manager (name and specialization), deadline and description.
- Lists the tasks the current user may see in a table: title, description, assigned agent, deadline, estimated hours, and a total hours row.
- A project outside the user's scope shows the not-found page, whether or not the project exists.

### FR-8 My tasks (agent)

- Lists every task assigned to the logged-in agent across all projects: title, description, project, project manager, deadline and estimated hours.
- Each row links to the related project detail, which shows only that agent's tasks.

### FR-9 Create from transcript (admin only)

- A page with a large text area for the transcript and a primary button, Create from transcript.
- Submitting empty or whitespace-only text shows "Paste the meeting transcript before creating projects" and sends nothing to the server.
- While the request runs, the button is disabled and reads "Analyzing transcript", a progress bar is visible and the text area is read only. A second click is impossible.
- Processing can take up to about 60 seconds. The page says so before the user clicks.
- On success, the page shows the created projects with task counts and total hours, any notes the AI produced, and a link to each project.
- On an AI or server failure, the page states that nothing was saved and that the user can try again.

### FR-10 Correction flow

- If the draft fails validation (section 7), nothing is saved. The page shows the draft as an editable form: one block per project and one row per task. Each invalid field is highlighted with its message next to it. People are chosen from dropdowns populated with the team directory, deadlines use date inputs and hours use number inputs.
- The AI's notes (issues) are shown above the form as information. They do not block saving on their own.
- Save corrections sends the edited draft to the server, which validates it again from scratch and saves it if valid. Any remaining errors are shown in the same form.
- Discard returns to the empty transcript page.

### FR-11 All-or-nothing save

- Projects and their tasks are saved inside one database transaction. If any insert fails, nothing is saved and the page shows an error.
- Application code generates project and task IDs. The AI only returns people by their existing IDs.

### FR-12 Persistence

- All records live in PostgreSQL. A browser refresh or a server restart shows the same data.

### FR-13 Access enforcement

- Every API endpoint resolves the current user from the session and applies the scope rules of section 3 inside the database query.
- Responses never include password hashes.
- The AI never receives emails or passwords, only id, name, role, specialization and skills.

## 6. AI extraction requirements

### Inputs

1. The team directory: every manager and agent as `{id, name, role, specialization, skills}`.
2. The full transcript as pasted. It is used whole. A prefilled result does not count as transcript conversion.

### Output

The model returns one JSON object in this shape. Nulls mark values the model could not resolve, and `issues` explains them in plain language.

```json
{
  "projects": [
    {
      "name": "Extracted project name",
      "clientName": "Extracted client",
      "description": "One or two sentences of scope, including what is excluded",
      "managerId": "PM01",
      "deadline": "2026-10-20",
      "tasks": [
        {
          "title": "Extracted task",
          "description": "One sentence of task scope",
          "assigneeId": "DEV01",
          "deadline": "2026-10-12",
          "estimatedHours": 12
        }
      ]
    }
  ],
  "issues": []
}
```

### Extraction rules

- R1. Final decisions win. When a deadline, estimate, owner or scope changes later in the meeting, the last agreed value is used. A closing recap is authoritative.
- R2. One project per client engagement the meeting agrees to deliver. Internal process or tooling discussion is not a project. Tasks are neither merged nor split beyond what was agreed; two tasks with the same owner stay two tasks.
- R3. Rejected, excluded or deferred features never become tasks. The exclusion may be mentioned in the project description.
- R4. Only people in the directory are used, by ID. A manager must have the MANAGER role and an assignee the AGENT role. Clients, end users and external contacts are never managers or assignees. No new people are ever invented.
- R5. Estimated hours are the developer effort stated in the meeting, never calendar days. No management or meeting tasks are created.
- R6. Dates are `YYYY-MM-DD`. When no year is stated, the meeting's year is used.
- R7. Project and task names are the names agreed in the meeting. Descriptions are one or two sentences.
- R8. A required value that is missing or ambiguous is returned as null with an explanation in `issues`. The model never guesses.

### Quality requirements

- The prompt contains no names, dates or facts from the supplied transcript. A changed transcript must produce a changed result.
- Extraction runs at the lowest available temperature with a JSON schema enforced through the provider's structured-output or tool-calling mode.
- If the model returns unparsable output, the application retries once with the parse error included. A second failure returns an error and saves nothing.
- The provider request has a 120 second timeout.

## 7. Validation rules

The server validates the complete draft before saving anything. All errors are collected and returned together, each with a path such as `projects[1].tasks[3].assigneeId`.

| Field | Rule | Message |
|---|---|---|
| projects | At least one project | Add at least one project |
| project.name | Non-empty text | Enter a project name |
| project.clientName | Non-empty text | Enter a client name |
| project.managerId | ID of an existing user with role MANAGER | Choose a manager from the team directory |
| project.deadline | `YYYY-MM-DD` and a real calendar date | Enter a valid deadline |
| task.title | Non-empty text | Enter a task title |
| task.assigneeId | ID of an existing user with role AGENT | Choose an agent from the team directory |
| task.deadline | Valid date, on or before the project deadline | Task deadline must be on or before the project deadline |
| task.estimatedHours | Number greater than zero | Enter the estimated hours |

The same validator runs for the automatic path and for the correction path. Client-side checks are a convenience only.

## 8. User interface requirements

### Design direction

Neo-brutalist and professional. True black 3 px borders, hard offset shadows, flat high-contrast colors, one accent color for primary actions, bold oversized titles and a strict 8 px grid. No soft gradients, no blur, no rounded corners, no decorative illustrations. `architecture.md` defines the tokens and components.

### Hard rules for all interface text

- No emojis anywhere, including loading states, empty states, buttons, badges and alerts.
- No em dashes or en dashes anywhere. Use commas, colons, periods or the word "to" for ranges.
- Sentence case for every heading, label and button. No all-caps labels.
- Buttons name the action: Log in, Log out, Create from transcript, Save corrections, Discard, Open project.
- Errors state what happened and what to do next. They do not apologize and are never vague.
- Dates are shown as `YYYY-MM-DD`. Hours are shown as a number followed by "h", for example "12 h".

### Screens

1. Login
2. Dashboard (admin)
3. My projects (manager)
4. Project detail (all roles, scoped)
5. My tasks (agent)
6. Team directory (all roles)
7. Create from transcript (admin), including the result and correction states
8. Not found

### States

Every list and detail screen has a loading state, an empty state with one sentence and one action, and an error state. The transcript page has idle, working, success, correction and error states.

### Responsiveness and accessibility

- Works from 360 px wide to desktop. Cards reflow from three columns to one. Tables scroll horizontally inside their bordered container.
- Every control has a visible keyboard focus style. Every input has a label. Color is never the only carrier of meaning; badges carry text.
- Motion only answers user actions (button press, panel reveal) and is disabled when the user prefers reduced motion.

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | Passwords hashed with bcrypt. Session identified by a signed, HTTP-only cookie. Secrets only in environment variables. No credentials in the repository. |
| Access control | Scope rules applied in database queries on every endpoint, including direct API calls. |
| Reliability | Transcript creation is atomic. A failed or invalid run leaves no partial records. |
| Performance | Normal pages load in under one second. The AI step completes in under 60 seconds for the supplied transcript. The server keeps serving other users while an AI request runs. |
| Persistence | PostgreSQL, hosted on Aiven for the live deployment. |
| Portability | Runs locally with one command per service and deploys as a single web service. |
| Observability | Server logs record each transcript run: user, duration, outcome and record counts. |

## 10. Acceptance criteria

### Reference output for the supplied transcript

| Project | Client | Manager | Deadline | Tasks | Hours |
|---|---|---|---|---|---|
| UrbanCart Website | UrbanCart Clothing | Ayesha Khan (PM01) | 2026-10-20 | 4 | 40 |
| QuickServe Mobile App | QuickServe Services | Bilal Ahmed (PM02) | 2026-10-24 | 4 | 46 |
| HelpDeskPro AI Assistant | HelpDeskPro Solutions | Hina Malik (PM03) | 2026-10-22 | 4 | 38 |

| Project | Task | Assignee | Deadline | Hours |
|---|---|---|---|---|
| UrbanCart Website | Product catalog UI | Ali Raza (DEV01) | 2026-10-12 | 12 |
| UrbanCart Website | Demo cart UI | Ali Raza (DEV01) | 2026-10-15 | 8 |
| UrbanCart Website | Product and cart APIs | Hamza Shah (DEV02) | 2026-10-14 | 14 |
| UrbanCart Website | Website integration and testing | Ali Raza (DEV01) | 2026-10-19 | 6 |
| QuickServe Mobile App | Login and profile screens | Sara Noor (DEV03) | 2026-10-12 | 8 |
| QuickServe Mobile App | Service booking screens | Sara Noor (DEV03) | 2026-10-17 | 12 |
| QuickServe Mobile App | Booking and account APIs | Hamza Shah (DEV02) | 2026-10-16 | 16 |
| QuickServe Mobile App | Mobile integration and testing | Usman Tariq (DEV04) | 2026-10-22 | 10 |
| HelpDeskPro AI Assistant | FAQ document processing | Maryam Asif (DEV06) | 2026-10-13 | 10 |
| HelpDeskPro AI Assistant | Assistant answer generation | Zain Abbas (DEV05) | 2026-10-17 | 14 |
| HelpDeskPro AI Assistant | Human escalation flow | Zain Abbas (DEV05) | 2026-10-18 | 6 |
| HelpDeskPro AI Assistant | Assistant evaluation and testing | Maryam Asif (DEV06) | 2026-10-21 | 8 |

Specific checks the organizers will make:

- UrbanCart's deadline is 2026-10-20, not 2026-10-18.
- Website integration and testing is due 2026-10-19, not 2026-10-17.
- Mobile integration and testing is 10 hours, not 8.
- Assistant evaluation and testing belongs to Maryam, not Zain.
- Kamran does not appear anywhere. No employee was created from the meeting.
- There are no payment, inventory, maps, driver tracking or email integration tasks.
- There is no fourth project for the CRM itself.
- Hamza's two API tasks and Ali's two frontend tasks stay separate.

### Changed-input test

Change Mobile integration and testing to 12 hours and 2026-10-23 wherever it is stated as final (the 09:28 segment and the final recap). The generated task reflects both values and every other task is unchanged.

### Demo script (section 8 of the brief)

1. Run the seed script twice. The user count stays at ten.
2. Log in as admin and paste the transcript.
3. Click Create from transcript. Three projects and twelve tasks are saved.
4. Open a project. Client, manager, deadline and tasks with hours are visible.
5. Log in as Ayesha. Only UrbanCart is listed.
6. Log in as Ali. Only his three tasks and UrbanCart are visible. Opening QuickServe's URL or calling its API returns 404.
7. Log in as Hamza. His two tasks appear across UrbanCart and QuickServe.
8. Refresh. Everything remains.
9. Run the changed-input transcript and show the changed task.

### Negative tests

- Calling the transcript endpoint as a manager or agent returns 403.
- Calling the transcript endpoint with empty text returns 400 and saves nothing.
- Submitting a draft that assigns a manager as an agent, or references an unknown ID, returns 422 with the field path and saves nothing.
- Double-clicking Create from transcript sends one request.

## 11. Deliverables

1. GitHub repository with `README.md`, `.env.example`, `prd.md` and `architecture.md`.
2. README contents: project and team name; stack; working features; exact setup and run commands; database setup and seed command; environment variable names; demo emails and passwords; transcript testing steps; live link and demo video link; deployment platform, database provider and deployment steps; known limitations.
3. Live application with a hosted database and demo credentials.
4. Demo video covering the demo script above, recorded even if the live link works.

## 12. Decisions and assumptions

- Stack: FastAPI, SQLAlchemy and PostgreSQL on the backend; React, Vite, TypeScript and Tailwind on the frontend; one web service serves both. Details in `architecture.md`.
- User IDs are the reference codes from the brief (ADMIN, PM01 to PM03, DEV01 to DEV06).
- Submitting the same transcript twice creates a second set of projects on purpose. `python -m app.reset` clears them.
- The LLM provider is whichever one the team has a key for. The adapter described in `architecture.md` isolates that choice.
- The whole team develops against one hosted database during the hackathon and announces before running reset.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AI output differs between runs | Lowest temperature, enforced schema, and an evaluation script that diffs output against section 10, run several times before the demo |
| AI call exceeds a hosting timeout | Long-running web service instead of serverless functions, 120 second client timeout, endpoint runs in a worker thread |
| Login cookie fails across domains | Frontend served by the API on one origin, Vite proxy in development |
| Dates shift by one day | Dates stored as DATE and transported as plain `YYYY-MM-DD` strings, never converted through JavaScript Date |
| Free hosting tier sleeps | Open the live link before judging and note cold starts in the README |
| Running out of time | Cut order: styling details first, then the editable correction form (replaced by an editable JSON text area), then nothing else |
