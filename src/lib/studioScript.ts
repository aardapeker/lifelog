/*
 * A Studio script's scenes, in and out of Markdown (no React Native here: tested with plain scripts).
 *   ## 1. The question
 *   > Visual: Alan Turing at Bletchley Park, archive photo
 *   Narration…
 */

export const WORDS_PER_MINUTE = 140; // calm documentary narration

export type Scene = { n: number; chapter: string; visual: string; narration: string };

/** The script's scenes, read back from the Markdown (for word counts now, voices and pictures later). */
export function scenesOf(md: string): Scene[] {
  const scenes: Scene[] = [];
  let cur: Scene | null = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(?:(\d+)[.)]\s*)?(.+)$/);
    if (h) {
      cur = { n: scenes.length + 1, chapter: h[2].trim(), visual: '', narration: '' };
      scenes.push(cur);
      continue;
    }
    if (!cur) continue;
    const v = line.match(/^>\s*(?:visual:\s*)?(.*)$/i);
    if (v) cur.visual = [cur.visual, v[1].trim()].filter(Boolean).join(' ');
    else if (line.trim()) cur.narration = [cur.narration, line.trim()].filter(Boolean).join('\n\n');
  }
  return scenes;
}

/** Scenes back into the script's Markdown. */
export function sceneMarkdown(scenes: { chapter: string; visual: string; narration: string }[]): string {
  return scenes
    .map((s, i) => [`## ${i + 1}. ${s.chapter.trim()}`, s.visual.trim() ? `> Visual: ${s.visual.trim()}` : null, s.narration.trim()].filter(Boolean).join('\n'))
    .join('\n\n');
}

/** How long the narration runs, from its words. */
export function spokenMinutes(md: string): { words: number; minutes: number } {
  const words = scenesOf(md)
    .map((s) => s.narration.split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  return { words, minutes: Math.round((words / WORDS_PER_MINUTE) * 10) / 10 };
}


/* ── fact check ── */

/** One doubtful claim: wrong (a source says otherwise) or unsure (nothing confirms it, or sources disagree). */
export type CheckItem = { scene: number; chapter: string; verdict: 'wrong' | 'unsure'; claim: string; note: string };

/**
 * The checker's reply for one scene, one claim per line ("WRONG: claim => what's true", "UNSURE: claim => why")
 * or "ALL GOOD". Lines in other shapes (the model chatting) are ignored.
 */
export function parseCheck(reply: string, scene: { n: number; chapter: string }): CheckItem[] {
  const items: CheckItem[] = [];
  for (const raw of reply.split('\n')) {
    const line = raw.replace(/^[\s*\-•\d.)]+/, '').replace(/\*\*/g, '').trim();
    const m = line.match(/^(WRONG|UNSURE)\s*:\s*(.+?)\s*(?:=>|→|->)\s*(.+)$/i);
    if (!m) continue;
    items.push({ scene: scene.n, chapter: scene.chapter, verdict: m[1].toUpperCase() === 'WRONG' ? 'wrong' : 'unsure', claim: m[2].trim(), note: m[3].trim() });
  }
  return items;
}

/** The editor's note that hands the problems to the rewrite. */
export function fixNote(items: CheckItem[]): string {
  return (
    'Fix these fact-check findings and change nothing else. For a WRONG claim, use what is true. For an UNSURE ' +
    'claim, soften it ("reportedly", "about") or drop it.\n' +
    items.map((c) => `- Scene ${c.scene}: ${c.verdict.toUpperCase()}: ${c.claim} => ${c.note}`).join('\n')
  );
}

/* ── changes between two versions of a script ── */

export type DiffPart = { op: 'same' | 'add' | 'del'; text: string };

/**
 * Word by word, what changed from `a` to `b` (longest common subsequence over words; the shared start
 * and end are skipped first, so a one-scene rewrite only compares that scene). Words keep the spaces
 * and line breaks after them; neighbouring words of the same kind are joined.
 */
export function diffWords(a: string, b: string): DiffPart[] {
  const A = a.match(/\S+\s*/g) ?? [];
  const B = b.match(/\S+\s*/g) ?? [];
  const same = (x: string, y: string) => x.trim() === y.trim();
  let start = 0;
  while (start < A.length && start < B.length && same(A[start], B[start])) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && same(A[endA - 1], B[endB - 1])) {
    endA--;
    endB--;
  }
  const a2 = A.slice(start, endA);
  const b2 = B.slice(start, endB);
  const n = a2.length;
  const m = b2.length;
  const out: DiffPart[] = [];
  const push = (op: DiffPart['op'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  if (start) push('same', B.slice(0, start).join(''));
  if (n * m > 4_000_000) {
    // too big to compare word by word (a whole new script): show it as replaced
    a2.forEach((t) => push('del', t));
    b2.forEach((t) => push('add', t));
  } else {
    // lcs[i][j] = common words of a2[i..] and b2[j..]
    const w = m + 1;
    const lcs = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i * w + j] = same(a2[i], b2[j]) ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (same(a2[i], b2[j])) {
        push('same', b2[j]);
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) push('del', a2[i++]);
      else push('add', b2[j++]);
    }
    while (i < n) push('del', a2[i++]);
    while (j < m) push('add', b2[j++]);
  }
  if (endB < B.length) push('same', B.slice(endB).join(''));
  return out;
}

/** How much changed: words added and removed. */
export function diffStats(parts: DiffPart[]): { added: number; removed: number } {
  const words = (t: string) => (t.match(/\S+/g) ?? []).length;
  return {
    added: parts.filter((p) => p.op === 'add').reduce((s, p) => s + words(p.text), 0),
    removed: parts.filter((p) => p.op === 'del').reduce((s, p) => s + words(p.text), 0),
  };
}
