/*
 * The journal's few Markdown basics, shared by the live editor and the reading view:
 * # headings (three sizes), - bullets, 1. numbers, - [ ] to-dos, > quotes and --- dividers.
 * Entries stay plain text, so the AI, search, backups and the radio read them like before.
 * No React or React Native in here: tested with plain scripts.
 */

export type LineKind = 'h1' | 'h2' | 'h3' | 'todo' | 'done' | 'bullet' | 'number' | 'quote' | 'divider' | 'text';

/** First match wins, so to-dos come before bullets and the divider before everything. */
const RULES: [LineKind, RegExp][] = [
  ['divider', /^(\s*)(-{3,}|\*{3,})\s*$/],
  ['h3', /^(\s*)(###\s+)/],
  ['h2', /^(\s*)(##\s+)/],
  ['h1', /^(\s*)(#\s+)/],
  ['done', /^(\s*)([-*]\s\[[xX]\]\s?)/],
  ['todo', /^(\s*)([-*]\s\[\s\]\s?)/],
  ['bullet', /^(\s*)([-*•]\s)/],
  ['number', /^(\s*)(\d+[.)]\s)/],
  ['quote', /^(\s*)(>\s?)/],
];

/** One line split into its marker ("- [ ] ", "## ", with any indent) and its text. */
export function parseLine(line: string): { kind: LineKind; marker: string; rest: string } {
  for (const [kind, re] of RULES) {
    const m = line.match(re);
    if (m) {
      const marker = kind === 'divider' ? line : m[1] + m[2];
      return { kind, marker, rest: line.slice(marker.length) };
    }
  }
  return { kind: 'text', marker: '', rest: line };
}

const LISTS: LineKind[] = ['bullet', 'number', 'todo', 'done', 'quote'];

/** The marker for the line after this one, when Enter continues a list. */
function nextMarker(kind: LineKind, marker: string): string {
  const indent = marker.match(/^\s*/)![0];
  if (kind === 'number') {
    const [, n, end] = marker.trim().match(/^(\d+)([.)])/)!;
    return `${indent}${Number(n) + 1}${end} `;
  }
  if (kind === 'todo' || kind === 'done') return `${indent}- [ ] `; // a new to-do starts unticked
  return marker;
}

/**
 * What the editor does after you type one character, like Notion:
 * - Enter in a list continues it ("- ", "2. ", "- [ ] "); Enter on an empty item ends the list
 * - "[] " becomes a to-do and "* " a bullet
 * Returns the new text and where the cursor goes, or null when nothing changes.
 */
export function afterTyping(before: string, after: string): { text: string; cursor: number } | null {
  if (after.length !== before.length + 1) return null;
  let p = 0;
  while (p < before.length && before[p] === after[p]) p++;
  const typed = after[p];
  if (after.slice(0, p) + after.slice(p + 1) !== before) return null; // not a single typed character

  const lineStart = before.lastIndexOf('\n', p - 1) + 1;
  if (typed === '\n') {
    const lineEnd = before.indexOf('\n', p) === -1 ? before.length : before.indexOf('\n', p);
    const line = before.slice(lineStart, lineEnd);
    const { kind, marker, rest } = parseLine(line);
    if (!LISTS.includes(kind) || p < lineStart + marker.length) return null;
    if (!rest.trim()) {
      // Enter on an empty item: the list ends, the marker goes away
      return { text: before.slice(0, lineStart) + before.slice(lineEnd), cursor: lineStart };
    }
    const next = nextMarker(kind, marker);
    return { text: after.slice(0, p + 1) + next + after.slice(p + 1), cursor: p + 1 + next.length };
  }
  if (typed === ' ') {
    const start = after.slice(lineStart, p + 1);
    const swap = start === '[] ' || start === '[ ] ' ? '- [ ] ' : start === '* ' ? '- ' : null;
    if (!swap) return null;
    return { text: after.slice(0, lineStart) + swap + after.slice(p + 1), cursor: lineStart + swap.length };
  }
  return null;
}

/** The "/" menu's blocks. */
export const SLASH_BLOCKS: { label: string; marker: string }[] = [
  { label: 'Heading', marker: '# ' },
  { label: 'Subheading', marker: '## ' },
  { label: 'Small heading', marker: '### ' },
  { label: 'To-do', marker: '- [ ] ' },
  { label: 'Bullets', marker: '- ' },
  { label: 'Numbers', marker: '1. ' },
  { label: 'Quote', marker: '> ' },
  { label: 'Divider', marker: '---\n' },
];

/** The "/" you just typed alone on a line: where it is, so the menu can replace it. Null otherwise. */
export function slashAt(text: string, cursor: number): number | null {
  if (cursor < 1 || text[cursor - 1] !== '/') return null;
  const lineStart = text.lastIndexOf('\n', cursor - 2) + 1;
  const lineEnd = text.indexOf('\n', cursor) === -1 ? text.length : text.indexOf('\n', cursor);
  return text.slice(lineStart, lineEnd) === '/' ? lineStart : null;
}

/** Replaces the lone "/" at `at` with a block's marker. */
export function applySlash(text: string, at: number, marker: string): { text: string; cursor: number } {
  return { text: text.slice(0, at) + marker + text.slice(at + 1), cursor: at + marker.length };
}

/** Ticks or unticks the to-do on line `index` (0-based). */
export function toggleTodo(body: string, index: number): string {
  const lines = body.split('\n');
  const line = lines[index];
  if (line === undefined) return body;
  const { kind } = parseLine(line);
  if (kind === 'todo') lines[index] = line.replace(/\[\s\]/, '[x]');
  else if (kind === 'done') lines[index] = line.replace(/\[[xX]\]/, '[ ]');
  return lines.join('\n');
}

export type Item = { kind: LineKind; text: string; line: number };
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; items: Item[] }
  | { type: 'quote'; text: string }
  | { type: 'divider' }
  | { type: 'para'; text: string };

/**
 * The entry as blocks to show: a heading is its own block even with text right under it,
 * list items of one list stay together, and blank lines end a paragraph. Items keep their
 * line number, so a to-do can be ticked in the reading view.
 */
export function blocksOf(body: string): Block[] {
  const out: Block[] = [];
  const lines = body.split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: 'para', text: para.join('\n').trim() });
    para = [];
  };
  lines.forEach((line, i) => {
    const { kind, rest } = parseLine(line);
    const last = out[out.length - 1];
    if (kind === 'text') {
      if (!line.trim()) flush();
      else para.push(line);
      return;
    }
    flush();
    if (kind === 'h1' || kind === 'h2' || kind === 'h3') out.push({ type: 'heading', level: kind === 'h1' ? 1 : kind === 'h2' ? 2 : 3, text: rest });
    else if (kind === 'divider') out.push({ type: 'divider' });
    else if (kind === 'quote') {
      if (last?.type === 'quote' && lines[i - 1] !== undefined && parseLine(lines[i - 1]).kind === 'quote') last.text += '\n' + rest;
      else out.push({ type: 'quote', text: rest });
    } else {
      const item = { kind, text: rest, line: i };
      if (last?.type === 'list' && lines[i - 1] !== undefined && parseLine(lines[i - 1]).kind !== 'text') last.items.push(item);
      else out.push({ type: 'list', items: [item] });
    }
  });
  flush();
  return out.filter((b) => b.type !== 'para' || b.text);
}

/** Inline markdown off: **bold**, *italic*, __x__, `code`, [text](link), "## " headings → the plain words. */
export function unmark(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(^|[^\w*])[*_](?=\S)([^*_\n]+?)(?<=\S)[*_](?!\w)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
}

/** The entry without its markers, for short previews: "☐ call mom", "• milk" (and no **bold** stars). */
export function plainText(body: string): string {
  return unmark(body)
    .split('\n')
    .map((line) => {
      const { kind, rest } = parseLine(line);
      if (kind === 'divider') return '';
      if (kind === 'todo') return `☐ ${rest}`;
      if (kind === 'done') return `☑ ${rest}`;
      if (kind === 'bullet') return `• ${rest}`;
      if (kind === 'number') return line.trim();
      return rest;
    })
    .join('\n');
}

/** The line the cursor is on: where it starts and ends. */
function lineAround(text: string, cursor: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', cursor - 1) + 1;
  const nl = text.indexOf('\n', cursor);
  return { start, end: nl === -1 ? text.length : nl };
}

/** What kind of line the cursor is on (the toolbar lights that button up). */
export function kindAt(text: string, cursor: number): LineKind {
  const { start, end } = lineAround(text, cursor);
  return parseLine(text.slice(start, end)).kind;
}

/**
 * "Turn into", like Notion: the cursor's line becomes a heading, a to-do, a list item… keeping its
 * text and indent. The same kind again turns it back into plain text.
 */
export function turnInto(text: string, cursor: number, marker: string): { text: string; cursor: number } {
  const { start, end } = lineAround(text, cursor);
  const line = text.slice(start, end);
  const { kind, marker: old, rest } = parseLine(line);
  const indent = old.match(/^\s*/)?.[0] ?? '';
  const wanted = parseLine(marker + 'x').kind;
  const same = wanted === kind || (wanted === 'todo' && kind === 'done');
  const body = kind === 'divider' ? '' : rest;
  const next = marker === '' || same ? (kind === 'text' ? line : body) : `${['bullet', 'number', 'todo', 'done', 'quote'].includes(wanted) ? indent : ''}${marker}${body}`;
  const out = text.slice(0, start) + next + text.slice(end);
  return { text: out, cursor: Math.max(start, Math.min(start + next.length, cursor + (next.length - line.length))) };
}

/** A divider under the cursor's line, with the cursor on a fresh line after it. */
export function insertDivider(text: string, cursor: number): { text: string; cursor: number } {
  const { end } = lineAround(text, cursor);
  const add = '\n---\n';
  return { text: text.slice(0, end) + add + text.slice(end), cursor: end + add.length };
}

/** Moves a list item in (+1) or out (-1) by two spaces. Other lines don't indent. */
export function indent(text: string, cursor: number, dir: 1 | -1): { text: string; cursor: number } | null {
  const { start, end } = lineAround(text, cursor);
  const line = text.slice(start, end);
  if (!['bullet', 'number', 'todo', 'done'].includes(parseLine(line).kind)) return null;
  if (dir === 1) return { text: text.slice(0, start) + '  ' + text.slice(start), cursor: cursor + 2 };
  const cut = line.match(/^ {1,2}/)?.[0].length ?? 0;
  if (!cut) return null;
  return { text: text.slice(0, start) + line.slice(cut) + text.slice(end), cursor: Math.max(start, cursor - cut) };
}
