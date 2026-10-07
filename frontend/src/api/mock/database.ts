import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';
import type { User } from '../types';

export interface ProjectRecord {
  id: string;
  name: string;
  clientName: string;
  description: string;
  managerId: string;
  deadline: string;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assigneeId: string;
  deadline: string;
  estimatedHours: number;
  createdAt: string;
}

export interface MockDatabase {
  version: 1;
  users: User[];
  projects: ProjectRecord[];
  tasks: TaskRecord[];
}

const DB_KEY = 'novaworks.mock.db';
const SESSION_KEY = 'novaworks.mock.session';

/* In-memory fallbacks for browsers where localStorage is unavailable. */
let memoryDb: MockDatabase | null = null;
let memorySession: string | null = null;

function emptyDatabase(): MockDatabase {
  return { version: 1, users: [], projects: [], tasks: [] };
}

/** Mirrors the backend seeder: upsert by email, so running it again never duplicates users. */
function seedDemoUsers(db: MockDatabase): void {
  for (const account of DEMO_ACCOUNTS) {
    const record: User = { ...account, skills: [...account.skills] };
    const existing = db.users.find((user) => user.email.toLowerCase() === account.email.toLowerCase());
    if (existing) Object.assign(existing, record);
    else db.users.push(record);
  }
}

function isDatabase(value: unknown): value is MockDatabase {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MockDatabase>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.tasks)
  );
}

export function loadDatabase(): MockDatabase {
  let stored: MockDatabase | null = null;
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    stored = isDatabase(parsed) ? parsed : null;
  } catch {
    stored = null;
  }
  const db = stored ?? memoryDb ?? emptyDatabase();
  seedDemoUsers(db);
  return db;
}

export function saveDatabase(db: MockDatabase): void {
  memoryDb = db;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* Keep the in-memory copy only. */
  }
}

export function readSession(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return memorySession;
  }
}

export function writeSession(userId: string | null): void {
  memorySession = userId;
  try {
    if (userId) window.localStorage.setItem(SESSION_KEY, userId);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* Keep the in-memory session only. */
  }
}

/** Removes all projects and tasks. Demo users and the current session are kept. */
export function resetMockData(): void {
  const db = loadDatabase();
  db.projects = [];
  db.tasks = [];
  saveDatabase(db);
}
