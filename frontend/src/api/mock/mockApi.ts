import { compareIsoDates } from '@/lib/dates';
import { DEMO_PASSWORD } from '@/lib/demo-accounts';
import { validateDraft } from '@/lib/draft-validation';
import { sumBy } from '@/lib/format';
import { ApiError, emitUnauthorized } from '../errors';
import type { Api, Draft, ProjectDetail, ProjectSummary, Task, TranscriptResult, User, UserRef } from '../types';
import {
  type MockDatabase,
  type ProjectRecord,
  type TaskRecord,
  loadDatabase,
  readSession,
  saveDatabase,
  writeSession,
} from './database';
import { extractDraftFromTranscript } from './extractor';

/*
 * In-browser stand-in for the backend. It applies the same access rules the server must
 * enforce, so the frontend can be built and demonstrated before the API exists.
 */

function latency(min: number, max: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, min + Math.random() * (max - min));
  });
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function copyUser(user: User): User {
  return { ...user, skills: [...user.skills] };
}

function toRef(user: User | undefined): UserRef | null {
  return user ? { id: user.id, name: user.name, role: user.role, specialization: user.specialization } : null;
}

function requireUser(db: MockDatabase): User {
  const sessionId = readSession();
  const user = sessionId ? db.users.find((candidate) => candidate.id === sessionId) : undefined;
  if (!user) {
    if (sessionId) writeSession(null);
    emitUnauthorized();
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again to continue.');
  }
  return user;
}

function requireAdmin(user: User): void {
  if (user.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only the administrator can create projects from a transcript.');
  }
}

/* Access rules from the brief: getProjects and getTasks. */

function visibleProjects(db: MockDatabase, user: User): ProjectRecord[] {
  if (user.role === 'ADMIN') return db.projects;
  if (user.role === 'MANAGER') return db.projects.filter((project) => project.managerId === user.id);
  const assigned = new Set(db.tasks.filter((task) => task.assigneeId === user.id).map((task) => task.projectId));
  return db.projects.filter((project) => assigned.has(project.id));
}

function visibleTasks(db: MockDatabase, user: User, project: ProjectRecord): TaskRecord[] {
  const tasks = db.tasks.filter((task) => task.projectId === project.id);
  if (user.role === 'ADMIN') return tasks;
  if (user.role === 'MANAGER') return project.managerId === user.id ? tasks : [];
  return tasks.filter((task) => task.assigneeId === user.id);
}

function toTask(db: MockDatabase, record: TaskRecord): Task {
  return {
    id: record.id,
    projectId: record.projectId,
    title: record.title,
    description: record.description,
    assigneeId: record.assigneeId,
    assignee: toRef(db.users.find((user) => user.id === record.assigneeId)),
    deadline: record.deadline,
    estimatedHours: record.estimatedHours,
  };
}

function toSummary(db: MockDatabase, project: ProjectRecord, tasks: TaskRecord[]): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    description: project.description,
    managerId: project.managerId,
    manager: toRef(db.users.find((user) => user.id === project.managerId)),
    deadline: project.deadline,
    taskCount: tasks.length,
    totalHours: sumBy(tasks, (task) => task.estimatedHours),
    createdAt: project.createdAt,
  };
}

function toDetail(db: MockDatabase, project: ProjectRecord, tasks: TaskRecord[]): ProjectDetail {
  return {
    ...toSummary(db, project, tasks),
    tasks: tasks
      .map((task) => toTask(db, task))
      .sort((a, b) => compareIsoDates(a.deadline, b.deadline) || a.title.localeCompare(b.title)),
  };
}

function byDeadline(a: { deadline: string; name: string }, b: { deadline: string; name: string }): number {
  return compareIsoDates(a.deadline, b.deadline) || a.name.localeCompare(b.name);
}

function validateAndSave(db: MockDatabase, draft: Draft): TranscriptResult {
  const issues = validateDraft(draft, db.users);
  if (issues.length > 0) return { status: 'needs_correction', draft, issues };

  // Validation guarantees every id, date, and hour value below is present.
  const now = new Date().toISOString();
  const projects: ProjectRecord[] = [];
  const tasks: TaskRecord[] = [];
  for (const draftProject of draft.projects) {
    const project: ProjectRecord = {
      id: newId('prj'),
      name: draftProject.name.trim(),
      clientName: draftProject.clientName.trim(),
      description: draftProject.description.trim(),
      managerId: draftProject.managerId as string,
      deadline: draftProject.deadline as string,
      createdAt: now,
    };
    projects.push(project);
    for (const draftTask of draftProject.tasks) {
      tasks.push({
        id: newId('tsk'),
        projectId: project.id,
        title: draftTask.title.trim(),
        description: draftTask.description.trim(),
        assigneeId: draftTask.assigneeId as string,
        deadline: draftTask.deadline as string,
        estimatedHours: draftTask.estimatedHours as number,
        createdAt: now,
      });
    }
  }

  // All or nothing: every record is added in a single write.
  db.projects.push(...projects);
  db.tasks.push(...tasks);
  saveDatabase(db);

  const created = projects.map((project) => toDetail(db, project, tasks.filter((task) => task.projectId === project.id)));
  return {
    status: 'created',
    projects: created,
    totals: { projects: created.length, tasks: tasks.length, hours: sumBy(tasks, (task) => task.estimatedHours) },
  };
}

export function createMockApi(): Api {
  return {
    mode: 'mock',
    auth: {
      async login(email, password) {
        await latency(350, 650);
        const db = loadDatabase();
        const user = db.users.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());
        if (!user || password !== DEMO_PASSWORD) {
          throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
        }
        writeSession(user.id);
        saveDatabase(db);
        return copyUser(user);
      },
      async logout() {
        await latency(120, 220);
        writeSession(null);
      },
      async me() {
        await latency(120, 260);
        const db = loadDatabase();
        const sessionId = readSession();
        const user = sessionId ? db.users.find((candidate) => candidate.id === sessionId) : undefined;
        return user ? copyUser(user) : null;
      },
    },
    team: {
      async list() {
        await latency(180, 360);
        const db = loadDatabase();
        requireUser(db);
        return db.users.map(copyUser);
      },
    },
    projects: {
      async list() {
        await latency(200, 420);
        const db = loadDatabase();
        const user = requireUser(db);
        return visibleProjects(db, user)
          .map((project) => toSummary(db, project, visibleTasks(db, user, project)))
          .sort(byDeadline);
      },
      async board() {
        await latency(220, 450);
        const db = loadDatabase();
        const user = requireUser(db);
        return visibleProjects(db, user)
          .map((project) => toDetail(db, project, visibleTasks(db, user, project)))
          .sort(byDeadline);
      },
      async get(id) {
        await latency(200, 400);
        const db = loadDatabase();
        const user = requireUser(db);
        const project = db.projects.find((candidate) => candidate.id === id);
        if (!project) throw new ApiError(404, 'NOT_FOUND', 'This project does not exist.');
        if (!visibleProjects(db, user).some((candidate) => candidate.id === id)) {
          throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this project.');
        }
        return toDetail(db, project, visibleTasks(db, user, project));
      },
    },
    transcripts: {
      async convert(transcript) {
        await latency(1600, 2600);
        const db = loadDatabase();
        requireAdmin(requireUser(db));
        if (!transcript.trim()) {
          throw new ApiError(400, 'EMPTY_TRANSCRIPT', 'Paste a meeting transcript before creating projects.');
        }
        const draft = extractDraftFromTranscript(transcript, db.users);
        if (draft.projects.length === 0) {
          throw new ApiError(
            422,
            'NO_PROJECTS_FOUND',
            'No projects were found in this transcript. Check that it names each project, client, manager, owner, deadline, and estimate.',
          );
        }
        return validateAndSave(db, draft);
      },
      async commit(draft) {
        await latency(500, 900);
        const db = loadDatabase();
        requireAdmin(requireUser(db));
        return validateAndSave(db, draft);
      },
    },
  };
}
