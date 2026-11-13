import type { SQLiteDatabase } from 'expo-sqlite';
import { geminiFirst, parseJsonReply } from './chat';
import { aboutUser } from './context';
import { getSetting, setSetting } from './db';
import { runJs, sameOutput } from './jsRun';

/*
 * Bug Arena: a coding game for break time. Short, tap-only rounds (no typing code on a phone):
 *  - 🔮 predict the output  - 🐛 bug hunt (tap the broken line)  - 🧩 fill the blank
 * Questions are written by the AI in batches (Gemini when its key is there: it's the funny one),
 * kept on the phone so rounds work offline, and JavaScript answers are double-checked by actually
 * running the code. Missed questions come back two rounds later until you get them right.
 * Lives, combos, XP, ranks, a daily streak, speed runs and a boss every few rounds keep it a game.
 */

export type Lang = 'js' | 'ts' | 'java' | 'c' | 'cpp' | 'rust';
export type Kind = 'predict' | 'bug' | 'blank';
export type Mode = 'round' | 'speed' | 'boss';

export type LangInfo = {
  key: Lang;
  label: string;
  short: string; // on the tile
  color: string;
  ready: boolean; // C, C++ and Rust come later
  boss: { name: string; emoji: string; taunts: string[] };
};

export const LANGS: LangInfo[] = [
  {
    key: 'js',
    label: 'JavaScript',
    short: 'JS',
    color: '#F7DF1E',
    ready: true,
    boss: {
      name: 'Undefined Is Not A Function Bey',
      emoji: '🤡',
      taunts: ['[] + {} is "[object Object]". You knew that, right?', 'typeof null... think carefully, little intern.', 'I coerce, therefore I am.'],
    },
  },
  {
    key: 'ts',
    label: 'TypeScript',
    short: 'TS',
    color: '#3178C6',
    ready: true,
    boss: {
      name: 'The `any` Pasha',
      emoji: '🧞',
      taunts: ['Just cast it to any. What could go wrong?', 'Your types are a suggestion. I am the law.', 'never say never.'],
    },
  },
  {
    key: 'java',
    label: 'Java',
    short: 'Java',
    color: '#E76F00',
    ready: true,
    boss: {
      name: 'NullPointerException Pasha',
      emoji: '☕',
      taunts: ['Did you check for null? No? Classic.', 'AbstractSingletonProxyFactoryBean says hi.', '== on Strings? Bold move.'],
    },
  },
  { key: 'c', label: 'C', short: 'C', color: '#A8B9CC', ready: false, boss: { name: 'Segfault Sensei', emoji: '💥', taunts: [] } },
  { key: 'cpp', label: 'C++', short: 'C++', color: '#659AD2', ready: false, boss: { name: 'The Template Error Wall', emoji: '🧱', taunts: [] } },
  { key: 'rust', label: 'Rust', short: 'Rust', color: '#DEA584', ready: false, boss: { name: 'The Borrow Checker', emoji: '🦀', taunts: [] } },
];
export const langInfo = (k: Lang) => LANGS.find((l) => l.key === k) ?? LANGS[0];

export const KINDS: Record<Kind, { emoji: string; label: string }> = {
  predict: { emoji: '🔮', label: 'Predict the output' },
  bug: { emoji: '🐛', label: 'Bug hunt' },
  blank: { emoji: '🧩', label: 'Fill the blank' },
};

export type Question = {
  id: string;
  lang: Lang;
  kind: Kind;
  level: number; // 1 easy … 5 hard
  topic: string;
  prompt: string;
  code: string;
  options: string[]; // predict / blank (bug: none, you tap a line)
  answer: number; // the right option, or (bug) the broken line, 0-based
  explain: string;
  roast: string; // said when you get it wrong
  boss?: boolean; // a harder one, saved for boss fights
  checked?: boolean; // the answer was confirmed by running the code
};

export type Mistake = Question & { due: number }; // comes back when you've played this many rounds

export type Progress = {
  xp: Partial<Record<Lang, number>>;
  rounds: Partial<Record<Lang, number>>;
  sinceBoss: Partial<Record<Lang, number>>; // rounds since the last boss fight
  bosses: Partial<Record<Lang, number>>; // bosses beaten
  speedBest: Partial<Record<Lang, number>>;
  right: number;
  wrong: number;
  bestCombo: number;
  streak: number; // days in a row with a round
  lastDay: string; // YYYY-MM-DD
  topics: Record<string, { r: number; w: number }>; // "js:closures"
  mistakes: Mistake[];
  recent: string[]; // recent topics, so new batches don't repeat
};

const EMPTY: Progress = { xp: {}, rounds: {}, sinceBoss: {}, bosses: {}, speedBest: {}, right: 0, wrong: 0, bestCombo: 0, streak: 0, lastDay: '', topics: {}, mistakes: [], recent: [] };

export const RANKS = [
  { xp: 0, emoji: '🐣', name: 'Stajyer' },
  { xp: 300, emoji: '🧑‍💻', name: 'Junior' },
  { xp: 1000, emoji: '⚙️', name: 'Mid-level' },
  { xp: 2500, emoji: '🧠', name: 'Senior' },
  { xp: 5000, emoji: '🎯', name: 'Kıdemli Bug Avcısı' },
  { xp: 10000, emoji: '🐧', name: 'Linus Torvalds' },
];

export const BOSS_EVERY = 4; // rounds between boss fights
export const ROUND_SIZE = 10;
export const SPEED_SECONDS = 60;
export const BOSS_QUESTIONS = 7;
export const BOSS_HP = 5; // right answers to beat a boss (with 3 lives)

export const totalXp = (p: Progress) => Object.values(p.xp).reduce((a, b) => a + (b ?? 0), 0);
export function rankOf(xp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1] ?? null;
  return { ...RANKS[i], index: i, next, toNext: next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1 };
}
/** Your level in a language (1–5), which sets how hard new questions are. */
export const levelOf = (p: Progress, lang: Lang) => Math.min(5, 1 + Math.floor((p.xp[lang] ?? 0) / 500));
export const bossReady = (p: Progress, lang: Lang) => (p.sinceBoss[lang] ?? 0) >= BOSS_EVERY;

/** XP for one right answer: harder and faster is worth more, and the combo multiplies it. */
export const xpFor = (q: Question, combo: number, ms: number) => Math.round((10 + q.level * 3 + (ms < 8000 ? 5 : 0)) * comboMult(combo));
export const comboMult = (combo: number) => (combo >= 6 ? 3 : combo >= 3 ? 2 : 1);

// ── storage ──

const PROGRESS = 'arena.progress';
const bankKey = (lang: Lang) => `arena.bank.${lang}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function getProgress(db: SQLiteDatabase): Promise<Progress> {
  try {
    const v = await getSetting(db, PROGRESS, '');
    const p = v ? ({ ...EMPTY, ...JSON.parse(v) } as Progress) : { ...EMPTY };
    // the streak breaks when a whole day went by without a round
    const y = new Date(Date.now() - 86_400_000);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    if (p.lastDay && p.lastDay !== today() && p.lastDay !== yesterday) p.streak = 0;
    return p;
  } catch {
    return { ...EMPTY };
  }
}
const saveProgress = (db: SQLiteDatabase, p: Progress) => setSetting(db, PROGRESS, JSON.stringify(p));

export async function getBank(db: SQLiteDatabase, lang: Lang): Promise<Question[]> {
  try {
    return JSON.parse(await getSetting(db, bankKey(lang), '[]')) as Question[];
  } catch {
    return [];
  }
}
const saveBank = (db: SQLiteDatabase, lang: Lang, b: Question[]) => setSetting(db, bankKey(lang), JSON.stringify(b));

// ── writing questions ──

/** Gemini when its key is saved (the funniest writer), otherwise whatever the chat uses. */
async function writer(db: SQLiteDatabase) {
  const w = await geminiFirst(db);
  if (!w) throw new Error('Add an AI key in Settings first: the questions are written by AI.');
  return w;
}

const TOPICS: Partial<Record<Lang, string>> = {
  js:
    'type coercion, == vs ===, typeof quirks, NaN, truthy/falsy, hoisting, var/let/const and TDZ, closures, `this` binding, ' +
    'arrow functions, the event loop (promises vs setTimeout order), async/await, array methods (map, filter, reduce, sort ' +
    'default order), spread/rest, destructuring defaults, optional chaining and ??, Map/Set, floating point, string methods, ' +
    'object references and copying, getters, classes, generators',
  ts:
    'type inference, unions and narrowing, literal types, `as const`, never, unknown vs any, generics and constraints, keyof ' +
    'and typeof, indexed access, utility types (Partial, Pick, Omit, Record, ReturnType), readonly, enums, tuples, ' +
    'structural typing, excess property checks, `satisfies`, optional properties, discriminated unions, function overloads, ' +
    'what compiles and what is a type error (option text like "Compile error"), plus runtime output of TS programs',
  java:
    'String == vs equals, the Integer cache (127 vs 128), integer overflow and division, char arithmetic, ++i vs i++, ' +
    'method overloading resolution, static vs instance, inheritance and polymorphism, constructors order, final, ' +
    'try/catch/finally return order, checked vs unchecked exceptions, ArrayList vs arrays, HashMap behaviour, ' +
    'immutability of String, StringBuilder, streams (map/filter/collect), Optional, records, switch expressions, var, ' +
    'generics, interfaces with default methods, equals/hashCode',
};

type RawQ = Partial<Omit<Question, 'id' | 'lang'>> & { js?: string; bugLine?: number };

const locks = new Map<Lang, Promise<number>>();

/** Makes sure a language has questions waiting; writes a new batch when it runs low. Returns how many are ready. */
export function ensureBank(db: SQLiteDatabase, lang: Lang, min = 12): Promise<number> {
  const running = locks.get(lang);
  if (running) return running;
  const job = (async () => {
    const bank = await getBank(db, lang);
    if (bank.filter((q) => !q.boss).length >= min) return bank.length;
    const fresh = await writeBatch(db, lang);
    const all = [...(await getBank(db, lang)), ...fresh];
    await saveBank(db, lang, all);
    return all.length;
  })().finally(() => locks.delete(lang));
  locks.set(lang, job);
  return job;
}

async function writeBatch(db: SQLiteDatabase, lang: Lang): Promise<Question[]> {
  const info = langInfo(lang);
  const p = await getProgress(db);
  const level = levelOf(p, lang);
  const weak = Object.entries(p.topics)
    .filter(([k, v]) => k.startsWith(`${lang}:`) && v.w > v.r)
    .sort((a, b) => b[1].w - b[1].r - (a[1].w - a[1].r))
    .slice(0, 4)
    .map(([k]) => k.slice(lang.length + 1));
  const w = await writer(db);
  const about = await aboutUser(db).catch(() => '');
  const reply = await w.adapter.complete({
    apiKey: w.apiKey,
    model: w.model,
    json: true,
    feature: 'arena',
    maxTokens: 12000,
    temperature: 1,
    system:
      `You write questions for "Bug Arena", a funny mobile coding game, for ${info.label} (${lang === 'java' ? 'Java 21' : lang === 'ts' ? 'TypeScript 5, strict mode' : 'modern JavaScript, Node 22'}). ` +
      'The player is learning to be a better developer in short breaks at work, on a phone. Questions must be CORRECT: ' +
      'trace every program step by step before you write the answer; only use code whose behaviour you are certain of. ' +
      'Programs are deterministic (no random, no dates, no input, no network).\n\n' +
      'PHONE SCREEN: code is at most 12 lines and at most 34 characters per line, 2-space indent. Short names.\n\n' +
      'Kinds:\n' +
      '- "predict": "What does this print?" (or "What happens?"). 4 options: the exact printed output (several lines ' +
      'joined with \\n; console.log / System.out formatting exactly as the real runtime prints it), or an error like ' +
      '"TypeError" / "Compile error" / "NullPointerException". Distractors are the classic wrong beliefs.\n' +
      '- "bug": a short program that should do something (say what in the prompt, e.g. "This should sum the list. Tap ' +
      'the broken line."). Exactly ONE line is wrong; "bugLine" is its 0-based line number. No options.\n' +
      '- "blank": the code contains ___ exactly once; 4 options are what could go there (a token or a short expression); ' +
      'exactly one makes the program do what the prompt says.\n\n' +
      '"explain": 1–2 short sentences that teach the rule, plain words, like a friend. "roast": one funny line for when ' +
      'they get it WRONG, like a best friend teasing (you may joke about their life below now and then: work, the ' +
      'servis, their cat, çay), never mean about real problems. "topic": 1–3 words. "level": 1 (easy) to 5 (hard).\n\n' +
      `Topics to pick from: ${TOPICS[lang] ?? 'the core language'}.\n\n` +
      `Return {"questions":[{"kind","level","topic","prompt","code","options":[…] or null,"answer":index or null,` +
      `"bugLine":index or null,"explain","roast","boss":true or false${lang === 'ts' ? ',"js":"for predict questions about runtime output: the same program as plain JavaScript (types removed), else null"' : ''}}]}` +
      (about ? `\n\nAbout the player (for the roasts only):\n${about.slice(0, 1500)}` : ''),
    prompt:
      `Write 16 questions: 12 regular ones around level ${level} (6 predict, 3 bug, 3 blank, mixed topics), and 4 harder ` +
      `ones at level ${Math.min(5, level + 1)} with "boss": true for the boss fight (any kind).\n` +
      (weak.length ? `They keep missing these topics, include a few: ${weak.join(', ')}.\n` : '') +
      (p.recent.length ? `Recently played topics (prefer others): ${p.recent.slice(-30).join(', ')}.\n` : ''),
  });
  const raw = parseJsonReply<{ questions?: RawQ[] }>(reply).questions ?? [];
  const now = Date.now();
  const list: (Question & { js?: string })[] = [];
  raw.forEach((r, i) => {
    const kind: Kind = r.kind === 'bug' || r.kind === 'blank' ? r.kind : 'predict';
    const code = (r.code ?? '').replace(/\t/g, '  ').replace(/\s+$/g, '');
    const lines = code.split('\n');
    const options = kind === 'bug' ? [] : (r.options ?? []).map((o) => String(o)).filter(Boolean).slice(0, 4);
    const answer = kind === 'bug' ? Number(r.bugLine ?? r.answer) : Number(r.answer);
    // anything malformed is skipped: a wrong question is worse than one less question
    if (!code || !r.prompt) return;
    if (kind === 'bug' ? !(answer >= 0 && answer < lines.length) : options.length < 2 || !(answer >= 0 && answer < options.length)) return;
    if (kind === 'blank' && !code.includes('___')) return;
    list.push({
      id: `${lang}-${now}-${i}`,
      lang,
      kind,
      level: Math.max(1, Math.min(5, Math.round(Number(r.level) || level))),
      topic: (r.topic ?? '').trim().toLowerCase() || 'basics',
      prompt: r.prompt.trim(),
      code,
      options,
      answer,
      explain: (r.explain ?? '').trim(),
      roast: (r.roast ?? '').trim(),
      boss: !!r.boss,
      js: lang === 'js' ? code : lang === 'ts' && r.js ? r.js : undefined,
    });
  });
  if (!list.length) throw new Error("The AI's questions came out broken. Try again?");
  return verify(list);
}

/**
 * JavaScript (and TypeScript's runtime) answers are checked by running the code. A wrong answer is
 * fixed when the real output is one of the options; a question with no right option is dropped.
 * If most checks disagree, the runner is the odd one out (a missing feature): keep them unchecked.
 */
async function verify(list: (Question & { js?: string })[]): Promise<Question[]> {
  const verdicts = new Map<string, 'ok' | 'fixed' | 'drop'>();
  const fixes = new Map<string, number>();
  for (const q of list) {
    if (q.kind !== 'predict' || !q.js) continue;
    const run = await runJs(q.js).catch(() => null);
    if (!run) continue;
    if (run.error) {
      // it threw: trust it only if the AI also said it throws
      const errorOption = q.options.findIndex((o) => o.toLowerCase().includes(run.error!.name.toLowerCase()));
      if (errorOption >= 0) {
        fixes.set(q.id, errorOption);
        verdicts.set(q.id, errorOption === q.answer ? 'ok' : 'fixed');
      }
      continue;
    }
    const match = q.options.findIndex((o) => sameOutput(o, run.out));
    if (match < 0) verdicts.set(q.id, 'drop');
    else {
      fixes.set(q.id, match);
      verdicts.set(q.id, match === q.answer ? 'ok' : 'fixed');
    }
  }
  const checked = [...verdicts.values()];
  const trustRunner = checked.filter((v) => v === 'ok').length >= checked.length / 2;
  return list
    .filter((q) => !trustRunner || verdicts.get(q.id) !== 'drop')
    .map(({ js: _js, ...q }) => {
      if (trustRunner && fixes.has(q.id)) return { ...q, answer: fixes.get(q.id)!, checked: true };
      return q;
    });
}

// ── rounds ──

/** Takes the questions for a round out of the bank (missed ones that are due come first in a normal round). */
export async function startRound(db: SQLiteDatabase, lang: Lang, mode: Mode): Promise<Question[]> {
  await ensureBank(db, lang, mode === 'speed' ? 20 : 12);
  const [bank, p] = await Promise.all([getBank(db, lang), getProgress(db)]);
  const played = p.rounds[lang] ?? 0;
  const level = levelOf(p, lang);
  const byLevel = (a: Question, b: Question) => Math.abs(a.level - level) - Math.abs(b.level - level);
  let picked: Question[];
  if (mode === 'boss') {
    const hard = bank.filter((q) => q.boss);
    const rest = bank.filter((q) => !q.boss).sort((a, b) => b.level - a.level);
    picked = [...hard, ...rest].slice(0, BOSS_QUESTIONS);
  } else if (mode === 'speed') {
    picked = shuffle(bank.filter((q) => !q.boss && q.kind !== 'bug')).slice(0, 25); // quick taps only
  } else {
    const due = p.mistakes.filter((m) => m.lang === lang && m.due <= played).slice(0, 3);
    const fresh = bank.filter((q) => !q.boss).sort(byLevel).slice(0, ROUND_SIZE - due.length);
    picked = shuffle([...due, ...fresh]);
  }
  const used = new Set(picked.map((q) => q.id));
  await saveBank(db, lang, bank.filter((q) => !used.has(q.id)));
  ensureBank(db, lang).catch(() => {}); // the next batch, while you play
  return picked.map(mixOptions);
}

/** The AI likes putting the right answer first: shuffle the options (and follow the answer). */
function mixOptions(q: Question): Question {
  if (q.kind === 'bug' || q.options.length < 2) return q;
  const order = shuffle(q.options.map((_, i) => i));
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

export type Answered = { q: Question; right: boolean; ms: number };

export type RoundResult = {
  progress: Progress;
  xp: number;
  rankUp: (typeof RANKS)[number] | null;
  record: boolean; // a new speed-run best
};

/** Saves a finished round: XP, streak, what you missed (it comes back), boss and speed records. */
export async function finishRound(
  db: SQLiteDatabase,
  lang: Lang,
  mode: Mode,
  answers: Answered[],
  xp: number,
  bestCombo: number,
  bossWon: boolean,
): Promise<RoundResult> {
  const p = await getProgress(db);
  const before = rankOf(totalXp(p));
  const played = (p.rounds[lang] ?? 0) + 1;
  p.rounds[lang] = played;
  p.xp[lang] = (p.xp[lang] ?? 0) + xp + (bossWon ? 150 : 0);
  p.sinceBoss[lang] = mode === 'boss' ? 0 : (p.sinceBoss[lang] ?? 0) + 1;
  if (bossWon) p.bosses[lang] = (p.bosses[lang] ?? 0) + 1;
  p.bestCombo = Math.max(p.bestCombo, bestCombo);
  const rights = answers.filter((a) => a.right).length;
  const record = mode === 'speed' && rights > (p.speedBest[lang] ?? 0);
  if (record) p.speedBest[lang] = rights;
  p.right += rights;
  p.wrong += answers.length - rights;
  const day = today();
  if (p.lastDay !== day) {
    p.streak += 1;
    p.lastDay = day;
  }
  for (const a of answers) {
    const k = `${lang}:${a.q.topic}`;
    const t = p.topics[k] ?? { r: 0, w: 0 };
    p.topics[k] = a.right ? { ...t, r: t.r + 1 } : { ...t, w: t.w + 1 };
    p.mistakes = p.mistakes.filter((m) => m.id !== a.q.id);
    if (!a.right) p.mistakes.push({ ...a.q, due: played + 2 }); // back in two rounds
  }
  p.mistakes = p.mistakes.slice(-60);
  p.recent = [...p.recent, ...answers.map((a) => a.q.topic)].slice(-40);
  await saveProgress(db, p);
  const after = rankOf(totalXp(p));
  return { progress: p, xp: xp + (bossWon ? 150 : 0), rankUp: after.index > before.index ? RANKS[after.index] : null, record };
}

/** A line for the radio hosts: what happened in Bug Arena lately (empty if nothing to brag about). */
export async function arenaNews(db: SQLiteDatabase): Promise<string> {
  const p = await getProgress(db);
  const played = Object.values(p.rounds).reduce((a, b) => a + (b ?? 0), 0);
  if (!played) return '';
  const rank = rankOf(totalXp(p));
  const bosses = LANGS.filter((l) => p.bosses[l.key]).map((l) => `${l.boss.name} (${l.label}) ×${p.bosses[l.key]}`);
  const weak = Object.entries(p.topics)
    .filter(([, v]) => v.w > v.r)
    .slice(0, 2)
    .map(([k]) => k.replace(':', ' '));
  return (
    `Bug Arena (the coding game in their app): rank ${rank.name}, ${totalXp(p)} XP, ${p.streak}-day streak, ${played} rounds` +
    (bosses.length ? `, bosses beaten: ${bosses.join(', ')}` : '') +
    (weak.length ? `, keeps getting wrong: ${weak.join(', ')}` : '') +
    '.'
  );
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
