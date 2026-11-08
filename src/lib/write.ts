import { router } from 'expo-router';

/** Opens the Write tab: a new entry, or (with an id) editing that entry. One way in, used everywhere. */
export function openWrite(opts: { id?: number; voice?: boolean; shared?: boolean } = {}): void {
  router.navigate({
    pathname: '/write',
    params: {
      id: opts.id !== undefined ? String(opts.id) : 'new',
      ...(opts.voice ? { voice: '1' } : {}),
      ...(opts.shared ? { shared: '1' } : {}),
      t: String(Date.now()),
    },
  });
}
