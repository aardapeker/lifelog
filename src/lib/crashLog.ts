import * as SecureStore from 'expo-secure-store';

/*
 * When Lifelog closes because of an error in its own code, the reason is written down (with a
 * synchronous write, so it lands before the app goes) and shown the next time you open it.
 * Crashes inside Android itself can't be caught here; those leave no note.
 */

const KEY = 'crash.last';

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
};

export function installCrashLog(): void {
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!eu) return;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => {
    try {
      const e = error instanceof Error ? error : new Error(String(error));
      const where = (e.stack ?? '').split('\n').slice(0, 6).join('\n');
      SecureStore.setItem(KEY, JSON.stringify({ at: Date.now(), fatal: !!isFatal, message: e.message, where }));
    } catch {}
    previous(error, isFatal);
  });
}

export type Crash = { at: number; fatal: boolean; message: string; where: string };

export function lastCrash(): Crash | null {
  try {
    const raw = SecureStore.getItem(KEY);
    return raw ? (JSON.parse(raw) as Crash) : null;
  } catch {
    return null;
  }
}

export function clearCrash(): void {
  SecureStore.deleteItemAsync(KEY).catch(() => {});
}
