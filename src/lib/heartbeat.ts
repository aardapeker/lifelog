/*
 * The radio's heartbeat. Android freezes JS timers when Lifelog is in the background (you're in
 * Spotify, or the phone is in your pocket), but events from native players keep arriving. While
 * a show is on air, the silent keep-alive playlist (onAir.ts) beats about once a second, and
 * anything that must keep working in the background waits on these beats instead of timers.
 */

const beats = new Set<() => void>();

/** Called by the keep-alive player on every status update. */
export function beat(): void {
  beats.forEach((f) => f());
}

/** Runs `f` about once a second while on air, in the foreground and the background. */
export function onBeat(f: () => void): () => void {
  beats.add(f);
  return () => beats.delete(f);
}

/** Waits `ms`, even in the background (a frozen timer is rescued by the heartbeat). */
export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const done = () => {
      clearTimeout(timer);
      off();
      resolve();
    };
    const timer = setTimeout(done, ms);
    const off = onBeat(() => {
      if (Date.now() >= end) done();
    });
  });
}
