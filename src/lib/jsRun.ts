/*
 * Runs a small JavaScript snippet on the phone, to check the answer an AI wrote for a Bug Arena
 * "what does this print?" question. console.log is captured and printed the way Node prints it.
 * Only for tiny, safe snippets: anything that could hang or reach outside (loops without an end,
 * network, require) isn't run, and the question simply stays unchecked.
 */

export type RunResult = { out: string; error: { name: string; message: string } | null };

// could loop forever, or needs things a phone app doesn't have
const RISKY = /\bwhile\s*\(|for\s*\(\s*;\s*;|setInterval|\bfetch\s*\(|\brequire\s*\(|\bimport\b|\bprocess\b|\bdocument\b|\bwindow\b|\balert\s*\(|\bprompt\s*\(/;

/** A value the way Node's console.log shows it: strings bare at the top, quoted inside arrays and objects. */
export function show(v: unknown, depth = 0): string {
  if (typeof v === 'string') return depth ? `'${v}'` : v;
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'bigint') return `${v}n`;
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'symbol') return v.toString();
  if (typeof v === 'function') return v.name ? `[Function: ${v.name}]` : '[Function (anonymous)]';
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (depth > 2) return Array.isArray(v) ? '[Array]' : '[Object]';
  if (Array.isArray(v)) return v.length ? `[ ${v.map((x) => show(x, depth + 1)).join(', ')} ]` : '[]';
  if (v instanceof Map) return `Map(${v.size}) {${v.size ? ` ${[...v].map(([k, x]) => `${show(k, depth + 1)} => ${show(x, depth + 1)}`).join(', ')} ` : ''}}`;
  if (v instanceof Set) return `Set(${v.size}) {${v.size ? ` ${[...v].map((x) => show(x, depth + 1)).join(', ')} ` : ''}}`;
  if (v instanceof Promise) return 'Promise { <pending> }';
  const entries = Object.entries(v as object);
  return entries.length ? `{ ${entries.map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${show(x, depth + 1)}`).join(', ')} }` : '{}';
}

/** Loose comparison of printed output: spacing and quote style don't matter. */
export const sameOutput = (a: string, b: string) => norm(a) === norm(b);
const norm = (s: string) => s.replace(/\s+/g, '').replace(/["'`]/g, '').toLowerCase();

/** Runs it and returns what it printed (and the error it threw, if any). Null when it can't be run here. */
export async function runJs(code: string): Promise<RunResult | null> {
  if (!code.trim() || RISKY.test(code)) return null;
  const lines: string[] = [];
  let open = true;
  const log = (...a: unknown[]) => {
    if (open) lines.push(a.map((x) => show(x)).join(' '));
  };
  const fakeConsole = { log, info: log, warn: log, error: log, debug: log };
  let error: RunResult['error'] = null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('console', code);
    fn.call({}, fakeConsole); // `this` at the top is {}, like a Node file
  } catch (e) {
    // a syntax error here usually means this phone's engine lacks a newer feature: can't judge
    if (e instanceof SyntaxError || !(e instanceof Error)) return null;
    error = { name: e.name, message: e.message };
  }
  // let promises and short timers finish (the event-loop questions)
  const timers = [...code.matchAll(/setTimeout\([\s\S]*?,\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  await new Promise((r) => setTimeout(r, Math.min(2000, Math.max(250, ...timers) + 150)));
  open = false;
  return { out: lines.join('\n'), error };
}
