import { useCallback, useEffect, useState } from 'react';
import { useRadar } from './useRadar';

/*
 * A tiny stand-in for the React Query hooks of the radar repo (shared/api/hooks.ts): load once,
 * keep the result, refetch on demand. Same shape (data / isPending / error / refetch) so the ported
 * components read the same.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setPending] = useState(enabled);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const refetch = useCallback(() => {
    setPending(true);
    setError(null);
    run()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setPending(false));
  }, [run]);
  useEffect(() => {
    if (enabled) refetch();
  }, [enabled, refetch]);
  return { data, setData, error, isError: !!error, isPending, refetch };
}

// the radar repo's hooks, on top of whichever backend useRadar() gives
export const useSummary = (id: string, enabled: boolean) => {
  const r = useRadar();
  return useLoad(() => r.summary(id), [r, id], enabled);
};
export const useReader = (id: string, enabled: boolean) => {
  const r = useRadar();
  return useLoad(() => r.reader(id), [r, id], enabled);
};
export const useStory = (id: string, enabled: boolean) => {
  const r = useRadar();
  return useLoad(() => r.story(id), [r, id], enabled);
};
