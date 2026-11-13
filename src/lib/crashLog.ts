import * as SecureStore from 'expo-secure-store';
import CrashCatcher from '../../modules/crash-catcher';

/*
 * When Lifelog closes because of an error in its own code, the reason is written down (with a
 * synchronous write, so it lands before the app goes) and shown the next time you open it.
 * Crashes inside Android itself are written down by the crash-catcher native module instead
 * (nativeCrash below), together with the last breadcrumb: what the app was doing at the time.
 */

const KEY = 'crash.last';

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
};

export function installCrashLog(): void {
  try {
    CrashCatcher?.install(); // native crashes too
  } catch {}
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

/** What the app is doing now ("radio: writing talks"), kept on disk so a native crash report says where it died. */
export function breadcrumb(text: string): void {
  try {
    CrashCatcher?.breadcrumb(text);
  } catch {}
}

/** The last native crash or abnormal exit (Android), as text, or null. Reading it marks it seen. */
export function nativeCrash(): string | null {
  try {
    const c = CrashCatcher?.lastCrash() ?? null;
    CrashCatcher?.clear();
    return c;
  } catch {
    return null;
  }
}
