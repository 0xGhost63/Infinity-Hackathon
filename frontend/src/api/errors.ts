const STATUS_MESSAGES: Record<number, string> = {
  0: 'Could not reach the server. Check your connection and that the backend is running, then try again.',
  400: 'The request was not valid.',
  401: 'Your session has ended. Sign in again to continue.',
  403: 'You do not have access to this.',
  404: 'This item could not be found.',
  409: 'This change conflicts with existing data.',
  422: 'Some details need attention before this can be saved.',
  429: 'Too many requests. Wait a moment, then try again.',
  500: 'The server ran into a problem. Try again.',
  502: 'The AI service did not respond. Try again in a moment.',
  503: 'The service is temporarily unavailable. Try again shortly.',
  504: 'The request took too long. Try again.',
};

export function messageForStatus(status: number): string {
  return STATUS_MESSAGES[status] ?? (status >= 500 ? STATUS_MESSAGES[500] : STATUS_MESSAGES[400]);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: unknown;

  constructor(status: number, code: string, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.message) return new ApiError(0, 'CLIENT_ERROR', error.message);
  return new ApiError(0, 'UNKNOWN_ERROR', messageForStatus(0));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/* Session expiry signal: the auth provider listens and returns the app to sign-in. */

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function emitUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => listener());
}
