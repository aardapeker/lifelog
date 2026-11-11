import type { SQLiteDatabase } from 'expo-sqlite';
import { getChatConfig, parseJsonReply, PROVIDERS } from './chat';
import { aboutUser, renderNotes } from './context';
import { getSetting, setSetting } from './db';
import { MONTHS, type Note } from './notes';
import { notify } from './notify';
import { playedSongs, playTimes } from './songMemory';

/*
 * Monthly Wrapped, unhinged edition. The numbers are counted on the phone (entries, words, moods,
 * your most-used word, the radio's top artist); the AI turns them into fake awards and roasts.
 * Kept in kv as `wrapped.YYYY-MM`. On the 1st (or later) last month's appears with a notification.
 */

export type WrappedStats = {
  entries: number;
  words: number;
  days: number; // days with at least one entry
  avgMood: number | null;
  topMood: { label: string; share: number } | null;
  topWord: { word: string; count: number } | null;
  bruh: number;
  cat: number;
  latest: string | null; // the latest time of night you wrote, "03:47"
  shows: number;
  topArtist: { name: string; plays: number } | null;
};

export type Wrapped = {
  month: string; // "2026-11"
  partial: boolean; // made before the month ended
  stats: WrappedStats;
  title: string;
  intro: string;
  topExcuse: string;
  awards: { emoji: string; title: string; text: string }[];
  arc: string; // the month as a movie plot, one line
  prediction: string;
  verdict: string;
  at: number;
};

const key = (month: string) => `wrapped.${month}`;
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const bounds = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()] as const;
};

// words too common to be "your word of the month" (English + Turkish)
const STOP = new Set(
  (
    'that this with have from they were what when your will just been then them there about would could which their ' +
    'into some than more also only very much like really after before because over again still even here today ' +
    'yesterday tomorrow going want need know think feel felt time work bugün yarın dün için gibi daha çok ama sonra ' +
    'şimdi bana beni benim sana seni senin onun bunu şunu biraz kadar diye olan oldu olarak bile değil zaman hiç ' +
    'neden nasıl çünkü şeyi şey falan filan iyi kötü gün günü gece akşam sabah yine tekrar artık hala'
  ).split(' '),
);

async function countStats(db: SQLiteDatabase, month: string): Promise<WrappedStats> {
  const [from, to] = bounds(month);
  const notes = await db.getAllAsync<Note & { mood: number | null; mood_label: string | null }>(
    'SELECT * FROM notes WHERE created_at >= ? AND created_at < ? ORDER BY created_at',
    from,
    to,
  );
  const words = notes.reduce((n, x) => n + x.body.split(/\s+/).filter(Boolean).length, 0);
  const days = new Set(notes.map((n) => new Date(n.created_at).toDateString())).size;
  const moods = notes.filter((n) => n.mood);
  const avgMood = moods.length ? moods.reduce((a, n) => a + (n.mood ?? 0), 0) / moods.length : null;
  const labels = new Map<string, number>();
  for (const n of notes) if (n.mood_label) labels.set(n.mood_label, (labels.get(n.mood_label) ?? 0) + 1);
  const [topLabel, topLabelN] = [...labels].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const counts = new Map<string, number>();
  let bruh = 0;
  let cat = 0;
  for (const n of notes) {
    const low = n.body.toLocaleLowerCase('tr');
    if (/\bbruh\b/.test(low)) bruh++;
    if (/şemistan|semistan/.test(low)) cat++;
    for (const w of low.match(/[a-zçğıöşüâîû']{4,}/g) ?? []) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const [word, wordN] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  // the latest you wrote: hours after midnight count as "late" (01:00 is later than 23:00)
  const late = notes
    .map((n) => new Date(n.created_at))
    .sort((a, b) => ((b.getHours() + 18) % 24) * 60 + b.getMinutes() - (((a.getHours() + 18) % 24) * 60 + a.getMinutes()))[0];
  // radio: plays this month by artist (play times are kept for 30 days)
  const [times, refs, shows] = await Promise.all([
    playTimes(db),
    playedSongs(db),
    db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM usage WHERE feature = 'radio' AND at >= ? AND at < ?", from, to),
  ]);
  const byArtist = new Map<string, number>();
  for (const r of refs) {
    const plays = (times[r.id] ?? []).filter((t) => t >= from && t < to).length;
    if (plays) byArtist.set(r.artist, (byArtist.get(r.artist) ?? 0) + plays);
  }
  const [artist, artistN] = [...byArtist].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return {
    entries: notes.length,
    words,
    days,
    avgMood,
    topMood: topLabel ? { label: topLabel, share: Math.round((topLabelN / Math.max(1, notes.length)) * 100) } : null,
    topWord: word ? { word, count: wordN } : null,
    bruh,
    cat,
    latest: late ? `${String(late.getHours()).padStart(2, '0')}:${String(late.getMinutes()).padStart(2, '0')}` : null,
    shows: shows?.n ?? 0,
    topArtist: artist ? { name: artist, plays: artistN } : null,
  };
}

export async function getWrapped(db: SQLiteDatabase, month: string): Promise<Wrapped | null> {
  try {
    const v = await getSetting(db, key(month), '');
    return v ? (JSON.parse(v) as Wrapped) : null;
  } catch {
    return null;
  }
}

/** Every Wrapped made so far, newest first. */
export async function listWrapped(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ key: string }>("SELECT key FROM kv WHERE key GLOB 'wrapped.[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND value != '' ORDER BY key DESC");
  return rows.map((r) => r.key.slice('wrapped.'.length));
}

/** Counts the month and has the friend (the chat model: it should sound like them) write the unhinged part. */
export async function makeWrapped(db: SQLiteDatabase, month: string): Promise<Wrapped> {
  const stats = await countStats(db, month);
  if (stats.entries < 3) throw new Error('Not enough entries this month for a Wrapped yet (it needs at least 3).');
  const chat = await getChatConfig(db);
  if (!chat.apiKey) throw new Error('Add an AI key in Settings first.');
  const [from, to] = bounds(month);
  const notes = await db.getAllAsync<Note>('SELECT * FROM notes WHERE created_at >= ? AND created_at < ? ORDER BY created_at', from, to);
  // the whole month can be long: every entry, each one cut short, newest kept when there are many
  const sample = notes.slice(-40).map((n) => ({ ...n, body: n.body.slice(0, 600) }));
  const reply = await PROVIDERS[chat.provider].complete({
    apiKey: chat.apiKey,
    model: chat.model,
    json: true,
    maxTokens: 2500,
    temperature: 1,
    feature: 'other',
    system:
      "You write the user's Monthly Wrapped, the UNHINGED edition, like Spotify Wrapped written by their funniest " +
      'best friend. Use the real numbers given and what actually happened in their journal. Over-the-top, specific, ' +
      'callback-heavy, lovingly roasting. Never mock their body, money troubles, health or anyone they lost. ' +
      'Same language as their journal. Return JSON: {"title": a dramatic name for their month, "intro": one line, ' +
      '"topExcuse": their most used excuse this month, as a funny quote, "awards": [5 or 6 fake awards, each ' +
      '{"emoji","title","text"} like "Most Dramatic Sigh of the Month"], "arc": the month as a one-line movie plot, ' +
      '"prediction": one absurd prediction for next month, "verdict": a final one-line verdict, warm underneath}.\n\n' +
      (await aboutUser(db)),
    prompt:
      `Month: ${monthName(month)}${Date.now() < to ? ' (still going: this is a sneak peek)' : ''}.\n` +
      `Numbers: ${JSON.stringify(stats)}\n\nEntries:\n${renderNotes(sample)}`,
  });
  const ai = parseJsonReply<Partial<Wrapped>>(reply);
  const w: Wrapped = {
    month,
    partial: Date.now() < to,
    stats,
    title: ai.title?.trim() || monthName(month),
    intro: ai.intro?.trim() ?? '',
    topExcuse: ai.topExcuse?.trim() ?? '',
    awards: (ai.awards ?? []).filter((a) => a?.title && a?.text).slice(0, 6),
    arc: ai.arc?.trim() ?? '',
    prediction: ai.prediction?.trim() ?? '',
    verdict: ai.verdict?.trim() ?? '',
    at: Date.now(),
  };
  await setSetting(db, key(month), JSON.stringify(w));
  return w;
}

/** On the 1st (or the first open after it): last month's Wrapped, once, with a notification. */
export async function ensureWrapped(db: SQLiteDatabase): Promise<void> {
  const now = new Date();
  const last = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const have = await getWrapped(db, last);
  if (have && !have.partial) return;
  if ((await getSetting(db, `${key(last)}.tried`, '')) === String(now.getDate())) return; // once a day at most
  await setSetting(db, `${key(last)}.tried`, String(now.getDate()));
  const w = await makeWrapped(db, last).catch(() => null);
  if (!w) return;
  await notify({
    title: `📼 Your ${monthName(last)} Wrapped is here`,
    body: w.title,
    data: { kind: 'wrapped', month: last },
  }).catch(() => {});
}
