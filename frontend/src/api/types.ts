export type Role = 'ADMIN' | 'MANAGER' | 'AGENT';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  specialization: string;
  skills: string[];
}

/** Compact person reference embedded in projects and tasks. */
export interface UserRef {
  id: string;
  name: string;
  role: Role;
  specialization: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assigneeId: string;
  assignee: UserRef | null;
  /** YYYY-MM-DD */
  deadline: string;
  estimatedHours: number;
}

/**
 * taskCount and totalHours only cover tasks the current user may see.
 * For an agent that means their own tasks in the project.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  clientName: string;
  description: string;
  managerId: string;
  manager: UserRef | null;
  /** YYYY-MM-DD */
  deadline: string;
  taskCount: number;
  totalHours: number;
  createdAt?: string;
}

export interface ProjectDetail extends ProjectSummary {
  tasks: Task[];
}

/* Transcript conversion */

export interface DraftTask {
  title: string;
  description: string;
  assigneeId: string | null;
  /** Raw name the AI read; used in messages when the id could not be resolved. */
  assigneeName?: string | null;
  deadline: string | null;
  estimatedHours: number | null;
}

export interface DraftProject {
  name: string;
  clientName: string;
  description: string;
  managerId: string | null;
  managerName?: string | null;
  deadline: string | null;
  tasks: DraftTask[];
}

export interface Draft {
  projects: DraftProject[];
}

/** Path examples: "projects", "projects.0.managerId", "projects.1.tasks.2.deadline" */
export interface DraftIssue {
  path: string;
  message: string;
}

export interface CreationTotals {
  projects: number;
  tasks: number;
  hours: number;
}

export interface TranscriptCreated {
  status: 'created';
  projects: ProjectDetail[];
  totals?: CreationTotals;
}

export interface TranscriptNeedsCorrection {
  status: 'needs_correction';
  draft: Draft;
  issues: DraftIssue[];
}

export type TranscriptResult = TranscriptCreated | TranscriptNeedsCorrection;

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface Api {
  readonly mode: 'http' | 'mock';
  auth: {
    login(email: string, password: string): Promise<User>;
    logout(): Promise<void>;
    /** Resolves to null when there is no active session. */
    me(): Promise<User | null>;
  };
  team: {
    list(options?: RequestOptions): Promise<User[]>;
  };
  projects: {
    list(options?: RequestOptions): Promise<ProjectSummary[]>;
    /** Projects with their visible tasks, used by the planning board. */
    board(options?: RequestOptions): Promise<ProjectDetail[]>;
    get(id: string, options?: RequestOptions): Promise<ProjectDetail>;
  };
  transcripts: {
    convert(transcript: string, options?: RequestOptions): Promise<TranscriptResult>;
    commit(draft: Draft, options?: RequestOptions): Promise<TranscriptResult>;
  };
}
