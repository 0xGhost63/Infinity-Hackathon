import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { type ApiError, isAbortError, toApiError } from '@/api/errors';

export type ResourceStatus = 'loading' | 'success' | 'error';

interface ResourceState<T> {
  status: ResourceStatus;
  data: T | undefined;
  error: ApiError | null;
}

export interface Resource<T> extends ResourceState<T> {
  reload: () => void;
}

/** Loads data on mount and whenever deps change. Stale responses are discarded. */
export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>, deps: DependencyList): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading', data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: undefined, error: null });
    loader(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setState({ status: 'error', data: undefined, error: toApiError(error) });
        }
      },
    );
    return () => controller.abort();
    // Callers list the loader's inputs in deps; the loader function itself changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...state, reload };
}
