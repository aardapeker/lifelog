import type { SQLiteDatabase } from 'expo-sqlite';
import { listReads } from './reads';
import { getChatConfig, parseJsonReply, PROVIDERS } from './chat';
import { aboutUser } from './context';
import { getSetting, setSetting } from './db';
import { groundedSearch, type Source } from './gemini';
import { getKey } from './keys';

/*
 * Studio: documentaries for the YouTube channel, made mostly by AI, polished by you on the weekend.
 * Phase 1 (this file): pick a topic → deep research with sources → a script in scenes (narration +
 * a visual note each) → your edits, by hand or by asking the AI → the publish kit (titles,
 * description, tags, thumbnail text, Shorts). Phase 2 voices and pictures the scenes, phase 3
 * exports a DaVinci Resolve project, phase 4 turns it into a blog post.
 *
 * The script is plain Markdown, so it opens in the journal's Notion-style editor:
 *   ## 1. The question
 *   > Visual: Alan Turing at Bletchley Park, archive photo
 *   Narration…
 */

export type Status = 'new' | 'researching' | 'researched' | 'writing' | 'ready' | 'error';
export type Note = { heading: string; text: string };
/** The last fact check: what looked wrong or unconfirmed, and the pages it read. */
export type Check = { at: number; scenes: number; failed: number; items: CheckItem[]; sources: Source[] };
export type Research = { notes: Note[]; sources: Source[]; queries: string[]; check?: Check };
export type Short = { title: string; script: string };
export type Kit = { titles: string[]; description: string; tags: string[]; thumbnail: string[]; shorts: Short[] };
export type Project = {
  id: number;
  topic: string;
  angle: string | null; // what you want it to focus on
  minutes: number; // target length
  status: Status;
  step: string | null; // what it's doing right now ("Searching: the 1950s")
  error: string | null;
  research: Research | null;
  script: string | null; // Markdown, scenes as above
  kit: Kit | null;
  created_at: number;
  updated_at: number;
};
export type Idea = { id: number; title: string; why: string };

type Row = Omit<Project, 'research' | 'kit'> & { research: string | null; kit: string | null };
const fromRow = (r: Row): Project => ({
  ...r,
  research: r.research ? (JSON.parse(r.research) as Research) : null,
  kit: r.kit ? (JSON.parse(r.kit) as Kit) : null,
});

export const LENGTHS = [5, 8, 10, 15];

// ---------------------------------------------------------------- storage

export async function listProjects(db: SQLiteDatabase): Promise<Project[]> {
  return (await db.getAllAsync<Row>('SELECT * FROM studio_projects ORDER BY updated_at DESC')).map(fromRow);
}

export async function getProject(db: SQLiteDatabase, id: number): Promise<Project | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM studio_projects WHERE id = ?', id);
  return r ? fromRow(r) : null;
}

export async function createProject(db: SQLiteDatabase, topic: string, minutes: number, angle?: string): Promise<number> {
  const now = Date.now();
  const res = await db.runAsync(
    'INSERT INTO studio_projects (topic, angle, minutes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    topic.trim(),
    angle?.trim() || null,
    minutes,
    'new',
    now,
    now,
  );
  return res.lastInsertRowId;
}

export async function deleteProject(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM studio_projects WHERE id = ?', id);
}

async function update(db: SQLiteDatabase, id: number, fields: Partial<Record<'status' | 'step' | 'error' | 'research' | 'script' | 'kit', string | null>>) {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  await db.runAsync(
    `UPDATE studio_projects SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => fields[k] ?? null),
    Date.now(),
    id,
  );
}

// ---------------------------------------------------------------- versions (like commits)

export type Version = { id: number; project_id: number; script: string; label: string; created_at: number };

/** Newest first. */
export const listVersions = (db: SQLiteDatabase, id: number) =>
  db.getAllAsync<Version>('SELECT * FROM studio_versions WHERE project_id = ? ORDER BY id DESC', id);

/** Keeps a version, unless it's the same text as the last one kept. */
async function keepVersion(db: SQLiteDatabase, id: number, script: string | null | undefined, label: string): Promise<void> {
  if (!script?.trim()) return;
  const last = await db.getFirstAsync<{ script: string }>('SELECT script FROM studio_versions WHERE project_id = ? ORDER BY id DESC LIMIT 1', id);
  if (last?.script === script) return;
  await db.runAsync('INSERT INTO studio_versions (project_id, script, label, created_at) VALUES (?, ?, ?, ?)', id, script, label, Date.now());
}

/** Before the AI (or a restore) changes the script: your typing since the last version becomes a version. */
async function keepEdits(db: SQLiteDatabase, id: number): Promise<void> {
  const p = await getProject(db, id);
  const any = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM studio_versions WHERE project_id = ?', id);
  await keepVersion(db, id, p?.script, any?.n ? 'Your edits' : 'The script before');
}

/** Back to an old version. Nothing is lost: the script you had is kept first, so this can be undone too. */
export async function restoreVersion(db: SQLiteDatabase, id: number, version: Version): Promise<void> {
  await keepEdits(db, id);
  await update(db, id, { script: version.script, status: 'ready' });
  await keepVersion(db, id, version.script, `Back to: ${version.label}`);
}

/** Your edits to the script (from the editor). */
export const saveScript = (db: SQLiteDatabase, id: number, script: string) => update(db, id, { script });

export { diffStats, diffWords, fixNote, scenesOf, sceneMarkdown, spokenMinutes, WORDS_PER_MINUTE, type CheckItem, type DiffPart, type Scene } from './studioScript';
import { fixNote, parseCheck, scenesOf, sceneMarkdown, WORDS_PER_MINUTE, type CheckItem } from './studioScript';

// ---------------------------------------------------------------- the AI work

async function writer(db: SQLiteDatabase) {
  const chat = await getChatConfig(db);
  if (!chat.apiKey) throw new Error('Add an API key in Settings first.');
  return { ...chat, adapter: PROVIDERS[chat.provider] };
}

const running = new Set<number>();
export const isRunning = (id: number) => running.has(id);

/** One job per project at a time; its progress and errors land on the project row. */
async function job(db: SQLiteDatabase, id: number, work: () => Promise<void>) {
  if (running.has(id)) return;
  running.add(id);
  try {
    await work();
  } catch (e) {
    await update(db, id, { status: 'error', step: null, error: e instanceof Error ? e.message : String(e) });
  } finally {
    running.delete(id);
  }
}

/**
 * Deep research: the AI first plans the angles a good documentary needs (origins, key people,
 * turning points, controversies, where it is today), then runs a Google-grounded search per angle.
 * Notes keep their sources, so you can check every fact.
 */
export function research(db: SQLiteDatabase, id: number): Promise<void> {
  return job(db, id, async () => {
    const p = await getProject(db, id);
    if (!p) return;
    const geminiKey = await getKey('gemini');
    if (!geminiKey) throw new Error('Research needs a Gemini key (for Google Search).');
    const w = await writer(db);
    await update(db, id, { status: 'researching', step: 'Planning what to look into…', error: null });
    const plan = parseJsonReply<{ angles?: string[] }>(
      await w.adapter.complete({
        feature: 'studio',
        apiKey: w.apiKey!,
        model: w.model,
        json: true,
        maxTokens: 800,
        system:
          'You plan research for a YouTube documentary. List 5 or 6 research angles that together give a strong, ' +
          'accurate story: origins, the key people, turning points, surprising details, controversies or myths, and ' +
          'where things stand today. Each angle is a short search-ready phrase. Return {"angles": [...]}.',
        prompt: `Documentary topic: ${p.topic}${p.angle ? `\nFocus: ${p.angle}` : ''}\nLength: about ${p.minutes} minutes`,
      }),
    );
    const angles = (plan.angles ?? []).map((a) => String(a).trim()).filter(Boolean).slice(0, 6);
    if (!angles.length) throw new Error("Couldn't plan the research. Try again?");
    const notes: Note[] = [];
    let sources: Source[] = [];
    let queries: string[] = [];
    for (const [i, angle] of angles.entries()) {
      await update(db, id, { step: `Searching ${i + 1}/${angles.length}: ${angle}` });
      const found = await groundedSearch(
        geminiKey,
        PROVIDERS.gemini.defaultModel,
        `Research notes for a documentary about "${p.topic}". This part: ${angle}. Give the key facts with specifics ` +
          '(names, dates, places, numbers, short quotes with who said them) from reliable sources, in 8 to 14 plain ' +
          'sentences. Mark anything uncertain, disputed or commonly misquoted.',
        'studio',
      ).catch(() => null); // one failed angle shouldn't sink the rest
      if (found?.text) notes.push({ heading: angle, text: found.text });
      sources = sources.concat(found?.sources ?? []);
      queries = queries.concat(found?.queries ?? []);
    }
    if (!notes.length) throw new Error('The searches came back empty. Online?');
    const seen = new Set<string>();
    const research: Research = {
      notes,
      sources: sources.filter((s) => (seen.has(s.uri) ? false : (seen.add(s.uri), true))).slice(0, 24),
      queries: [...new Set(queries)].slice(0, 16),
    };
    await update(db, id, { status: 'researched', step: null, research: JSON.stringify(research) });
  });
}

const STYLE =
  'Style: a calm, gripping documentary narrator (think a good YouTube video essay): clear, vivid, a little dry ' +
  'humour, short sentences that are easy to read aloud, no hype words, no "in this video" filler. The first scene ' +
  'is a hook that makes people stay (a surprising fact or a question) in under 15 seconds of narration. Facts ONLY ' +
  'from the research notes; never invent dates, numbers or quotes. Visual notes say what to show: an archive photo ' +
  'of whom or what, a map, a diagram, stock footage of what, on-screen text.';

/** The script, in scenes, plus the publish kit. Uses the research; overwrites an earlier script. */
export function writeScript(db: SQLiteDatabase, id: number): Promise<void> {
  return job(db, id, async () => {
    const p = await getProject(db, id);
    if (!p?.research) return;
    const w = await writer(db);
    await update(db, id, { status: 'writing', step: `Writing a ${p.minutes}-minute script…`, error: null });
    const words = p.minutes * WORDS_PER_MINUTE;
    const reply = await w.adapter.complete({
      feature: 'studio',
      apiKey: w.apiKey!,
      model: w.model,
      json: true,
      maxTokens: Math.min(16000, 2500 + words * 3),
      lightThinking: true,
      system:
        `You write the script for an English YouTube documentary of about ${p.minutes} minutes (about ${words} words of ` +
        `narration in total). ${STYLE}\n` +
        'Return JSON: {"scenes": [{"chapter": "short scene name", "visual": "what to show", "narration": "what the ' +
        `narrator says"}] (one scene per 20 to 45 seconds of narration), "titles": [3 YouTube titles, curious but not ` +
        'clickbait, max 60 characters], "description": "a YouTube description: 2 short paragraphs, then chapter ' +
        'timestamps as 0:00 lines estimated from the narration length", "tags": [10 to 15 tags], "thumbnail": [3 ' +
        'thumbnail texts, max 4 words each], "shorts": [2 or 3 YouTube Shorts cut from the best moments: {"title", ' +
        '"script": "30 to 50 seconds of narration that works on its own"}]}.\n\n' +
        (await aboutUser(db)),
      prompt:
        `Topic: ${p.topic}${p.angle ? `\nFocus: ${p.angle}` : ''}\n\nResearch notes:\n\n` +
        p.research.notes.map((n) => `## ${n.heading}\n${n.text}`).join('\n\n'),
    });
    const r = parseJsonReply<{
      scenes?: { chapter?: string; visual?: string; narration?: string }[];
      titles?: string[];
      description?: string;
      tags?: string[];
      thumbnail?: string[];
      shorts?: { title?: string; script?: string }[];
    }>(reply);
    const scenes = (r.scenes ?? []).filter((s) => s?.narration?.trim()).map((s) => ({ chapter: s.chapter ?? 'Scene', visual: s.visual ?? '', narration: s.narration! }));
    if (!scenes.length) throw new Error('The script came back empty. Try again?');
    const kit: Kit = {
      titles: (r.titles ?? []).map(String).filter(Boolean).slice(0, 3),
      description: r.description?.trim() ?? '',
      tags: (r.tags ?? []).map(String).filter(Boolean).slice(0, 15),
      thumbnail: (r.thumbnail ?? []).map(String).filter(Boolean).slice(0, 3),
      shorts: (r.shorts ?? []).filter((s) => s?.script?.trim()).map((s) => ({ title: s.title ?? 'Short', script: s.script! })).slice(0, 3),
    };
    await keepEdits(db, id);
    const script = sceneMarkdown(scenes);
    await update(db, id, { status: 'ready', step: null, script, kit: JSON.stringify(kit) });
    await keepVersion(db, id, script, p.script ? 'New script' : 'First script');
  });
}

/**
 * Your note to the AI ("make scene 3 funnier", "shorter intro", "more drama when Hawking warns"):
 * it rewrites the script and keeps the scene format. Only the parts the note is about should change.
 */
export function reviseScript(db: SQLiteDatabase, id: number, note: string, label = `AI: ${note.trim().slice(0, 80)}`): Promise<void> {
  return job(db, id, async () => {
    const p = await getProject(db, id);
    if (!p?.script) return;
    const w = await writer(db);
    await update(db, id, { step: 'Rewriting…', error: null });
    const reply = await w.adapter.complete({
      feature: 'studio',
      apiKey: w.apiKey!,
      model: w.model,
      maxTokens: Math.min(16000, 2000 + p.script.length),
      lightThinking: true,
      system:
        `You edit a YouTube documentary script. ${STYLE}\nApply the editor's note and change ONLY what it asks for; ` +
        'keep every other scene exactly as it is. Keep the format: each scene starts with "## N. Chapter", then a ' +
        '"> Visual: ..." line, then the narration. Return only the full script in that format, nothing else.',
      prompt:
        `Editor's note: ${note.trim()}\n\nResearch notes (facts only from these):\n` +
        (p.research?.notes.map((n) => `## ${n.heading}\n${n.text}`).join('\n\n') ?? '(none)') +
        `\n\nThe script:\n\n${p.script}`,
    });
    const script = reply.replace(/^```(?:markdown|md)?\s*|\s*```$/g, '').trim();
    if (!scenesOf(script).length) throw new Error("The rewrite didn't come back as a script. Try again?");
    await keepEdits(db, id);
    await update(db, id, { status: 'ready', step: null, script });
    await keepVersion(db, id, script, label);
  });
}

/**
 * Fact check: every scene (narration and visual note) goes to Gemini with Google Search, which lists the
 * claims that are wrong or that nothing confirms. Confirmed claims aren't listed. Kept with the research;
 * "Fix these" hands the list to the rewrite. A scene whose check fails is counted, not fatal (a failed job
 * would mark the whole project as broken).
 */
export function factCheck(db: SQLiteDatabase, id: number): Promise<void> {
  return job(db, id, async () => {
    const p = await getProject(db, id);
    if (!p?.script) return;
    const geminiKey = await getKey('gemini');
    if (!geminiKey) throw new Error('The fact check needs a Gemini key (for Google Search).');
    const scenes = scenesOf(p.script);
    const items: CheckItem[] = [];
    let sources: Source[] = [];
    let failed = 0;
    for (const sc of scenes) {
      await update(db, id, { step: `Fact-checking scene ${sc.n}/${scenes.length}: ${sc.chapter}`, error: null });
      const found = await groundedSearch(
        geminiKey,
        PROVIDERS.gemini.defaultModel,
        `Fact-check this scene of a documentary script about "${p.topic}" with Google Search. Check every specific ` +
          'claim: names, dates, numbers, quotes, events, products, in the narration and in the visual note. Reply ' +
          'with one line per claim that is WRONG or that you can NOT confirm, exactly like this:\n' +
          'WRONG: <the claim, short> => <what is true, short>\n' +
          'UNSURE: <the claim, short> => <why: no source found, or sources disagree>\n' +
          'Leave out the claims you confirmed. If everything checks out, reply exactly: ALL GOOD\n\n' +
          `Scene ${sc.n}. ${sc.chapter}\nVisual note: ${sc.visual || '(none)'}\nNarration: ${sc.narration}`,
        'studio',
      ).catch(() => null);
      if (!found) {
        failed++;
        continue;
      }
      items.push(...parseCheck(found.text, sc));
      sources = sources.concat(found.sources);
    }
    const seen = new Set<string>();
    const check: Check = {
      at: Date.now(),
      scenes: scenes.length,
      failed,
      items,
      sources: sources.filter((s) => (seen.has(s.uri) ? false : (seen.add(s.uri), true))).slice(0, 20),
    };
    const research: Research = { ...(p.research ?? { notes: [], sources: [], queries: [] }), check };
    await update(db, id, { step: null, research: JSON.stringify(research) });
  });
}

/** "Fix these": the rewrite gets the fact check's findings as its editor's note. */
export const fixChecked = (db: SQLiteDatabase, id: number, items: CheckItem[]) =>
  reviseScript(db, id, fixNote(items), `AI: fact-check fixes (${items.length})`);

// ---------------------------------------------------------------- ideas

const IDEAS_EVERY = 7 * 86_400_000;

export async function listIdeas(db: SQLiteDatabase): Promise<Idea[]> {
  return db.getAllAsync<Idea>('SELECT id, title, why FROM studio_ideas ORDER BY id DESC LIMIT 8');
}

export async function dropIdea(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM studio_ideas WHERE id = ?', id);
}

/**
 * New documentary ideas, from what's on your mind: Radar's headlines, your Reads, your interests.
 * Weekly on its own (when Studio opens), or now with `force`.
 */
export async function refreshIdeas(db: SQLiteDatabase, force = false): Promise<Idea[]> {
  if (!force && Date.now() - Number(await getSetting(db, 'studio.ideasAt', '0')) < IDEAS_EVERY) return listIdeas(db);
  const w = await writer(db);
  const headlines = await db.getAllAsync<{ title: string }>('SELECT title FROM radar_items WHERE published_at > ? ORDER BY published_at DESC LIMIT 40', Date.now() - 14 * 86_400_000);
  const reads = (await listReads(db, 10)).map((r) => r.topic);
  const done = (await listProjects(db)).map((p) => p.topic);
  const reply = await w.adapter.complete({
    feature: 'studio',
    apiKey: w.apiKey!,
    model: w.model,
    json: true,
    maxTokens: 1200,
    system:
      'You suggest topics for an English tech-and-history YouTube documentary channel (video essays like "Can ' +
      'machines think?"). 6 ideas with a strong story: a person, a turning point, a mystery, a rivalry, a "how did we ' +
      'get here". Lean on what this person is into and what is in the news for them, but each must work as an ' +
      'evergreen story. Never repeat a video they already made. Return {"ideas": [{"title": "working title", "why": ' +
      '"one sentence: the hook"}]}.\n\n' +
      (await aboutUser(db)),
    prompt:
      `Recent headlines from their topics:\n${headlines.map((h) => `- ${h.title}`).join('\n') || '(none)'}\n\n` +
      `Things they got curious about:\n${reads.map((r) => `- ${r}`).join('\n') || '(none)'}\n\n` +
      `Videos already made or in progress:\n${done.map((d) => `- ${d}`).join('\n') || '(none)'}`,
  });
  const ideas = (parseJsonReply<{ ideas?: { title?: string; why?: string }[] }>(reply).ideas ?? []).filter((i) => i?.title?.trim());
  if (ideas.length) {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM studio_ideas');
      for (const i of ideas) await db.runAsync('INSERT INTO studio_ideas (title, why, created_at) VALUES (?, ?, ?)', i.title!.trim(), i.why?.trim() ?? '', Date.now());
    });
  }
  await setSetting(db, 'studio.ideasAt', String(Date.now()));
  return listIdeas(db);
}
