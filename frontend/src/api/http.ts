import { config } from '@/config';
import { ApiError, emitUnauthorized, isAbortError, messageForStatus } from './errors';
import type {
  Api,
  ProjectDetail,
  ProjectSummary,
  RequestOptions,
  TranscriptNeedsCorrection,
  TranscriptResult,
  User,
} from './types';

const TOKEN_KEY = 'novaworks.token';

/* Optional bearer token. Cookie sessions work without it; see docs/api-contract.md. */

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Storage can be unavailable in private browsing; cookie sessions still work. */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const { error, message, detail } = payload;
    if (isRecord(error) && typeof error.message === 'string') return error.message;
    if (typeof error === 'string') return error;
    if (typeof message === 'string') return message;
    if (typeof detail === 'string') return detail;
  }
  return messageForStatus(status);
}

function readErrorCode(payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string') {
    return payload.error.code;
  }
  return `HTTP_${status}`;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface HttpOptions extends RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** A 401 from these means "not signed in", not "session expired". */
const SESSION_PROBES = new Set(['/api/auth/login', '/api/auth/me']);

async function request<T>(path: string, { method = 'GET', body, signal }: HttpOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', messageForStatus(0));
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    if (response.status === 401 && !SESSION_PROBES.has(path)) {
      writeToken(null);
      emitUnauthorized();
    }
    throw new ApiError(
      response.status,
      readErrorCode(payload, response.status),
      readErrorMessage(payload, response.status),
      payload,
    );
  }
  return payload as T;
}

function isNeedsCorrection(payload: unknown): payload is TranscriptNeedsCorrection {
  return (
    isRecord(payload) &&
    payload.status === 'needs_correction' &&
    isRecord(payload.draft) &&
    Array.isArray(payload.issues)
  );
}

async function transcriptRequest(path: string, body: unknown, options?: RequestOptions): Promise<TranscriptResult> {
  try {
    return await request<TranscriptResult>(path, { method: 'POST', body, signal: options?.signal });
  } catch (error) {
    // A 422 that carries a draft is an expected outcome: the admin corrects it on the review screen.
    if (error instanceof ApiError && error.status === 422 && isNeedsCorrection(error.payload)) {
      return error.payload;
    }
    throw error;
  }
}

export function createHttpApi(): Api {
  return {
    mode: 'http',
    auth: {
      async login(email, password) {
        const data = await request<{ user: User; token?: string }>('/api/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        writeToken(data.token ?? null);
        return data.user;
      },
      async logout() {
        try {
          await request<null>('/api/auth/logout', { method: 'POST' });
        } finally {
          writeToken(null);
        }
      },
      async me() {
        try {
          const data = await request<{ user: User }>('/api/auth/me');
          return data.user;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            writeToken(null);
            return null;
          }
          throw error;
        }
      },
    },
    team: {
      async list(options) {
        return (await request<{ users: User[] }>('/api/team', options)).users;
      },
    },
    projects: {
      async list(options) {
        return (await request<{ projects: ProjectSummary[] }>('/api/projects', options)).projects;
      },
      async board(options) {
        return (await request<{ projects: ProjectDetail[] }>('/api/projects?include=tasks', options)).projects;
      },
      async get(id, options) {
        return (await request<{ project: ProjectDetail }>(`/api/projects/${encodeURIComponent(id)}`, options)).project;
      },
    },
    transcripts: {
      convert(transcript, options) {
        return transcriptRequest('/api/transcripts/convert', { transcript }, options);
      },
      commit(draft, options) {
        return transcriptRequest('/api/transcripts/commit', { draft }, options);
      },
    },
  };
}
