import { getShareExtensionKey } from 'expo-share-intent';

/**
 * Android opens the app with a special URL when something is shared into it.
 * That URL isn't a screen, so send it to the home screen; the share handler takes it from there.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return '/';
    return path;
  } catch {
    return '/';
  }
}
