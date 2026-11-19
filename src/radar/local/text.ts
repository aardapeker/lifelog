import { parseDocument } from 'htmlparser2';
import { textContent } from 'domutils';

/* Port of the radar backend's common.Text and common.Domains. */

// plain character ranges instead of \p{…} classes (safer on the phone's JS engine)
const LATIN = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g;
const OTHER_SCRIPTS = /[\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g;
/** Anything that isn't a letter or digit (Latin, Greek, Cyrillic) */
export const NOT_WORD = /[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\u0370-\u03FF\u0400-\u04FF]+/g;

/** HTML (or text with entities) → plain text, whitespace collapsed. */
export function toPlainText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = /[<&]/.test(html) ? textContent(parseDocument(html, { decodeEntities: true })) : html;
  const out = text.replace(/\s+/g, ' ').trim();
  return out || null;
}

export function truncate(s: string | null, max: number): string | null {
  if (!s) return s;
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** The snippet only repeats the headline (Google/Bing often do): not worth showing. */
export function repeats(snippet: string | null, title: string): boolean {
  if (!snippet) return false;
  const norm = (s: string) => s.toLowerCase().replace(NOT_WORD, '');
  const a = norm(snippet);
  const b = norm(title);
  return !a || a === b || a.startsWith(b) || b.startsWith(a);
}

/** Mostly Latin letters (URLs ignored): drops headlines in other scripts when only en/tr is wanted. */
export function isMostlyLatin(s: string): boolean {
  const t = s.replace(/https?:\/\/\S+/g, '');
  const latin = (t.match(LATIN) ?? []).length;
  const other = (t.match(OTHER_SCRIPTS) ?? []).length;
  return latin + other === 0 || latin / (latin + other) >= 0.7;
}

/** "https://www.theverge.com/2026/…" → "theverge.com" */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^/?#:]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : null;
}

/** "4 Dec 2026" from an ISO date or ms, null for a missing or odd one (cards of TMDB, MusicBrainz, F1). */
export function shortDate(when: string | number | null | undefined): string | null {
  const t = typeof when === 'number' ? when : when ? Date.parse(when) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** True when every word of `keyword` is in `text` as a whole word ("AFAD" isn't in "Meta's plan"). */
export function hasWords(text: string, keyword: string): boolean {
  const words = new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const want = keyword.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return want.length > 0 && want.every((w) => words.has(w));
}
