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

