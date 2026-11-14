import { File, Paths } from 'expo-file-system';
import { useEffect, useRef } from 'react';
import CrashCatcher from '../../modules/crash-catcher';

/*
 * Speed measurements, to find what makes the first seconds feel slow (Settings → Privacy → Speed).
 * Everything is measured from the moment Android started the app's process (read from the native
 * crash-catcher module), so the timeline includes the part before any JavaScript runs.
 *  - mark(): a moment on the startup timeline (JS loaded, database ready, fonts, first screen…)
 *  - freezes: for the first 20 s, every time the JS thread was stuck for 150 ms or more
 *  - useFirstFrame(): how long a screen took from your tap (or its first render) to being drawn
 *  - time(): how long a piece of work took (the Life tab's database reads…)
 * A week of launches is kept in a small file on the phone (at most 150). Nothing leaves it.
 */

// the very first line of JS that runs (index.ts imports this file first)
const jsStartWall = Date.now();
const processAgeAtJsStart = (() => {
  try {
    return CrashCatcher?.processAgeMs() ?? null;
  } catch {
    return null;
  }
})();
/** ms since the process started (or since JS started, when the native number isn't there) */
const since = () => (processAgeAtJsStart ?? 0) + (Date.now() - jsStartWall);

export type Entry = { at: number; label: string; ms?: number; kind: 'mark' | 'freeze' | 'screen' | 'work' };
export type Run = { started: string; native: boolean; entries: Entry[] };

const run: Run = { started: new Date(jsStartWall).toISOString(), native: processAgeAtJsStart !== null, entries: [] };
const add = (e: Entry) => {
  run.entries.push(e);
  scheduleSave();
};

// Android had the native side ready here (before our JS bundle started loading): splits the wait before "JS started"
try {
  const ready = CrashCatcher?.nativeReadyMs?.();
  if (typeof ready === 'number' && ready > 0) run.entries.push({ at: ready, label: 'native side ready', kind: 'mark' });
} catch {}

/** A moment on the startup timeline (only the first time each label happens). */
export function mark(label: string): void {
  if (run.entries.some((e) => e.kind === 'mark' && e.label === label)) return;
  add({ at: since(), label, kind: 'mark' });
}

/** Times a piece of work. */
export async function time<T>(label: string, work: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    return await work();
  } finally {
    add({ at: since(), label, ms: Date.now() - t, kind: 'work' });
  }
}

// ── tab taps → first frame ──

const tapped = new Map<string, number>();
/** The tab bar calls this on a tap, so the screen can say how long it took to appear. */
export function tabTapped(name: string): void {
  tapped.set(name, Date.now());
}

/**
 * In a screen: how long its FIRST appearance took, from the tap on its tab (when there was one in
 * the last 5 s) or from its first render, to the frame after it mounted.
 */
export function useFirstFrame(name: string): void {
  const born = useRef(Date.now());
  useEffect(() => {
    requestAnimationFrame(() => {
      const tap = tapped.get(name);
      const from = tap && born.current - tap < 5000 ? tap : born.current;
      add({ at: since(), label: tap && from === tap ? `${name} (from the tap)` : name, ms: Date.now() - from, kind: 'screen' });
    });
    // only the first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── freezes: a timer that should tick every 50 ms; when it's late, the JS thread was stuck ──

const TICK = 50;
const WATCH_MS = 20_000;
const MIN_FREEZE = 150;
(() => {
  let last = Date.now();
  const stopAt = last + WATCH_MS;
  const tick = () => {
    const now = Date.now();
    const late = now - last - TICK;
    if (late >= MIN_FREEZE) add({ at: since() - late, label: 'JS thread stuck', ms: late, kind: 'freeze' });
    last = now;
    if (now < stopAt) setTimeout(tick, TICK);
    else mark('freeze watch ended (20 s)');
  };
  setTimeout(tick, TICK);
})();

// ── keeping a week of launches ──

const KEEP_MS = 7 * 86_400_000;
const KEEP_MAX = 150;
const fresh = (r: Run) => Date.now() - Date.parse(r.started) < KEEP_MS;

const file = () => new File(Paths.document, 'speed-runs.json');
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const old = pastRuns().filter((r) => r.started !== run.started);
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify([run, ...old].filter(fresh).slice(0, KEEP_MAX)));
    } catch {}
  }, 1500);
}

/** This week's launches, newest first. */
export function pastRuns(): Run[] {
  try {
    const f = file();
    if (!f.exists) return [run];
    const saved = JSON.parse(f.textSync()) as Run[];
    return [run, ...saved.filter((r) => r.started !== run.started && fresh(r))].slice(0, KEEP_MAX);
  } catch {
    return [run];
  }
}

/** A launch as plain text (for the screen and the Copy button). */
export function describe(r: Run): string {
  const lines = [...r.entries]
    .sort((a, b) => a.at - b.at)
    .map((e) => {
      const at = `${(e.at / 1000).toFixed(2)}s`.padStart(7);
      return e.kind === 'mark' ? `${at}  ${e.label}` : `${at}  ${e.kind === 'freeze' ? '🧊' : e.kind === 'screen' ? '🧱' : '🗄️'} ${e.label}: ${e.ms} ms`;
    });
  return `${new Date(r.started).toLocaleString()}${r.native ? '' : ' (times from JS start, not process start)'}\n${lines.join('\n')}`;
}

/**
 * The week in one table: for every step, the typical (median) and worst time over all launches, and
 * how often the JS thread froze. Startup steps are "seconds after launch"; screens and work are durations.
 */
export function summary(runs: Run[]): string {
  if (!runs.length) return 'No launches measured yet.';
  const by = new Map<string, number[]>();
  const push = (k: string, v: number) => by.set(k, [...(by.get(k) ?? []), v]);
  let freezes = 0;
  let worstFreeze = 0;
  for (const r of runs) {
    for (const e of r.entries) {
      if (e.kind === 'freeze') {
        freezes++;
        worstFreeze = Math.max(worstFreeze, e.ms ?? 0);
      } else if (e.kind === 'mark') push(`⏱️ ${e.label}`, e.at);
      else push(`${e.kind === 'screen' ? '🧱' : '🗄️'} ${e.label}`, e.ms ?? 0);
    }
  }
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const fmt = (k: string, ms: number) => (k.startsWith('⏱️') ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)} ms`);
  const rows = [...by.entries()]
    .sort((a, b) => (a[0].startsWith('⏱️') === b[0].startsWith('⏱️') ? median(a[1]) - median(b[1]) : a[0].startsWith('⏱️') ? -1 : 1))
    .map(([k, v]) => `${k}: typical ${fmt(k, median(v))}, worst ${fmt(k, Math.max(...v))} (×${v.length})`);
  return [
    `${runs.length} launch${runs.length === 1 ? '' : 'es'} this week`,
    ...rows,
    `🧊 JS thread stuck ≥ ${MIN_FREEZE} ms: ${freezes} time${freezes === 1 ? '' : 's'} in total, ${(freezes / runs.length).toFixed(1)} per launch, worst ${worstFreeze} ms`,
  ].join('\n');
}

/** Starts the week over (this launch stays). */
export function clearRuns(): void {
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {}
  scheduleSave();
}
