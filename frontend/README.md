# NovaWorks PM, frontend

Frontend for the Infinity Hack '26 AI Project Manager challenge. The administrator pastes a meeting transcript, the backend's AI turns it into projects and tasks, and each manager and agent sees only the work they are allowed to see.

## Stack

React 18, TypeScript, Vite 5, React Router 6, lucide-react icons, and the Archivo variable font (self-hosted through Fontsource). Styling is plain CSS with design tokens, with no UI framework.

## Run it without a backend (mock API)

```bash
npm install
npm run dev:mock
```

Open http://localhost:5173 and pick a demo account on the sign-in screen.

Mock mode runs an in-browser API that applies the same role rules as the real backend and keeps data in localStorage. "Reset mock data" in the footer clears projects and tasks. Its transcript extraction is a simple parser that reads only the final recap and leaves descriptions empty. It is for frontend work only: the judged flow must run against the real backend and LLM.

## Run it against the backend

```bash
cp .env.example .env      # set DEV_API_PROXY_TARGET if the backend is not on http://localhost:8000
npm run dev
```

In development, requests to `/api` are proxied to the backend, so cookies work without CORS setup. The endpoints, response shapes, access rules, and validation rules the backend must implement are in [docs/api-contract.md](docs/api-contract.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server against the real backend |
| `npm run dev:mock` | Dev server with the in-browser mock API |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run build:mock` | Same, with the mock API baked in (for a frontend-only demo) |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run typecheck` | TypeScript check only |

## Environment variables

| Name | Purpose | Example |
| --- | --- | --- |
| `VITE_API_MODE` | `http` for the backend, `mock` for the in-browser API | `http` |
| `VITE_API_BASE_URL` | Backend origin in production; leave empty in development | `https://novaworks-api.onrender.com` |
| `VITE_SHOW_DEMO_ACCOUNTS` | Show the demo account picker on sign-in | `true` |
| `DEV_API_PROXY_TARGET` | Where the dev server forwards `/api` | `http://localhost:8000` |

`VITE_*` values are baked in at build time and are visible in the browser. Never put secrets in them.

## Demo accounts

Every account uses the password `Demo123!`. These are fictional.

| Role | Name | Email |
| --- | --- | --- |
| Administrator | Admin | admin@novaworks.example |
| Manager, Web PM | Ayesha Khan | ayesha@novaworks.example |
| Manager, Mobile PM | Bilal Ahmed | bilal@novaworks.example |
| Manager, AI PM | Hina Malik | hina@novaworks.example |
| Agent, Full-Stack | Ali Raza | ali@novaworks.example |
| Agent, Full-Stack | Hamza Shah | hamza@novaworks.example |
| Agent, App Developer | Sara Noor | sara@novaworks.example |
| Agent, App Developer | Usman Tariq | usman@novaworks.example |
| Agent, AI Developer | Zain Abbas | zain@novaworks.example |
| Agent, AI Developer | Maryam Asif | maryam@novaworks.example |

## Screens and access

| Screen | Route | Administrator | Manager | Agent |
| --- | --- | --- | --- | --- |
| Overview or My tasks (planning board) | `/` | All projects | Projects they manage | Their own tasks, grouped by project |
| Projects (sortable table) | `/projects` | All | Managed | Projects containing their tasks |
| Project detail (timeline and tasks) | `/projects/:id` | All tasks | All tasks, if they manage it | Their own tasks only |
| Team (read-only directory) | `/team` | Yes | Yes | Yes |
| Create from Transcript | `/transcript` | Yes | No (403) | No (403) |

Route guards only shape the interface. The backend must enforce the same rules on every request.

## Transcript flow

1. The admin pastes a transcript (or uses "Insert sample transcript") and selects Create from Transcript. The button locks while the request runs, so a double click cannot create duplicates.
2. If the draft is valid, everything is saved in one step and the new projects appear on a board.
3. If a person, date, or estimate cannot be resolved, a review screen lists each problem with a link to its field. Nothing is saved until every field passes validation.
4. Errors such as an unavailable AI service are shown with a retry, and the transcript is kept.

## Verified behaviour (mock mode, headless Chromium)

- The supplied transcript produces 3 projects and 12 tasks matching the organizer answer key (40, 46, and 38 hours, with all revised values).
- Ayesha sees only UrbanCart and gets 403 on other projects. Ali sees only his 3 tasks. Hamza sees 2 tasks across UrbanCart and QuickServe. Agents get 403 on the transcript page.
- Changing QuickServe integration to 12 hours and 23 October in the transcript is reflected in the output.
- Assigning a task to Kamran, or a task deadline after the project deadline, opens the review screen and saves nothing until fixed.
- Data persists after a refresh, seeding never duplicates users, and there are no console errors.

## Project structure

```
src/
  api/            types, HTTP client, error handling, mock API (mock/)
  auth/           session context and route guards
  components/
    board/        planning board (project lanes, task notes)
    projects/     projects table, task table, deadline timeline
    transcript/   step rail, directory, processing state, draft review, result
    layout/       app shell, top bar, page headers
    ui/           buttons, fields, alerts, tags, avatars, loaders
    feedback/     loading, error, 403, 404 views
  lib/            dates, formatting, validation, demo accounts, sample transcript
  pages/          one file per route
  styles/         tokens, base, components, layout, board, pages
docs/api-contract.md
```

## Deployment

Run `npm run build` with `VITE_API_MODE=http` and `VITE_API_BASE_URL` set to the deployed backend, then host `dist/` on any static host. `vercel.json` and `public/_redirects` (Netlify) send all routes to `index.html` so deep links work.

## Known limitations

- Editing saved projects and tasks is not implemented (optional in the brief).
- The mock extractor reads only the final recap and does not produce descriptions.
