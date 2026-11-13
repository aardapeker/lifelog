import type { AnyNode, Element } from 'domhandler';
import { findAll, findOne, getAttributeValue, removeElement, textContent } from 'domutils';
import { parseDocument } from 'htmlparser2';
import type { ReaderBlock } from '../types';
import { get } from './feeds';
import { domainOf } from './text';

/*
 * Port of the backend's ArticleText: fetches an article once and pulls out its readable content,
 * like Firefox's Reader View: headings, paragraphs, quotes, list items and images, without menus,
 * ads or popups. Used for the reader and the AI TL;DR. Nothing is stored.
 */

/** Below this, the "article" is a paywall teaser, a login wall or a page that needs JavaScript. */
export const MIN_READABLE_CHARS = 600;
const MAX_CHARS = 12_000; // enough for a summary
const MAX_READER_CHARS = 80_000;
const MAX_IMAGES = 15;

const JUNK_TAGS = new Set(['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'iframe', 'svg']);
const JUNK_ROLES = new Set(['navigation', 'banner', 'contentinfo']);
const JUNK_CLASSES = ['newsletter', 'related', 'share', 'social', 'comments', 'advert', 'ad-container', 'cookie-banner'];

export type ParsedArticle = { title: string | null; siteName: string | null; blocks: ReaderBlock[] };

export const plainText = (a: ParsedArticle) =>
  a.blocks
    .filter((b) => b.type !== 'img')
    .map((b) => b.text)
    .join('\n');
export const readable = (a: ParsedArticle) => plainText(a).length >= MIN_READABLE_CHARS;
export const summaryText = (a: ParsedArticle) => plainText(a).slice(0, MAX_CHARS);

const tag = (e: Element) => e.name.toLowerCase();
const text = (n: AnyNode) => textContent(n).replace(/\s+/g, ' ').trim();
const els = (root: AnyNode[], test: (e: Element) => boolean) => findAll(test, root);

function junk(e: Element): boolean {
  if (JUNK_TAGS.has(tag(e))) return true;
  if (getAttributeValue(e, 'aria-hidden') === 'true') return true;
  if (JUNK_ROLES.has(getAttributeValue(e, 'role') ?? '')) return true;
  const cls = (getAttributeValue(e, 'class') ?? '').toLowerCase().split(/\s+/);
  return JUNK_CLASSES.some((j) => cls.includes(j));
}

function meta(root: AnyNode[], property: string): string | null {
  const m = findOne((e) => tag(e) === 'meta' && getAttributeValue(e, 'property') === property, root);
  return (m && getAttributeValue(m, 'content')?.trim()) || null;
}

/** Relative image paths made absolute (React Native's URL can't do this, so by hand). */
function absolute(src: string, base: string): string | null {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith('//')) return `https:${src}`;
  const origin = base.match(/^https?:\/\/[^/]+/)?.[0];
  if (!origin) return null;
  if (src.startsWith('/')) return origin + src;
  return base.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/') + src;
}

const paragraphChars = (e: Element) =>
  els(e.children, (x) => tag(x) === 'p')
    .map((p) => text(p).length)
    .filter((n) => n >= 40)
    .reduce((a, b) => a + b, 0);

/** <article> or <main> if they have real text, else the parent of the most paragraph text. */
function container(root: AnyNode[]): Element | null {
  for (const test of [(e: Element) => tag(e) === 'article', (e: Element) => tag(e) === 'main', (e: Element) => getAttributeValue(e, 'role') === 'main']) {
    const el = findOne(test, root);
    if (el && paragraphChars(el) >= 400) return el;
  }
  const score = new Map<Element, number>();
  for (const p of els(root, (e) => tag(e) === 'p')) {
    const len = text(p).length;
    const parent = p.parent as Element | null;
    if (len >= 40 && parent && 'name' in parent) score.set(parent, (score.get(parent) ?? 0) + len);
  }
  let best: Element | null = null;
  let max = 0;
  score.forEach((v, k) => {
    if (v > max) [best, max] = [k, v];
  });
  return best ?? findOne((e) => tag(e) === 'body', root);
}

const tiny = (size: string | undefined) => {
  const n = parseInt((size ?? '').replace(/\D/g, ''), 10);
  return !Number.isNaN(n) && n < 80;
};

export function parse(html: string, url: string): ParsedArticle {
  const doc = parseDocument(html, { decodeEntities: true });
  const root = doc.children;
  const h1 = findOne((e) => tag(e) === 'h1', root);
  const titleEl = findOne((e) => tag(e) === 'title', root);
  const title = meta(root, 'og:title') ?? (h1 ? text(h1) : titleEl ? text(titleEl) : null);
  const siteName = meta(root, 'og:site_name') ?? domainOf(url);
  for (const j of els(root, junk)) removeElement(j);
  const box = container(root);
  if (!box) return { title, siteName, blocks: [] };

  const blocks: ReaderBlock[] = [];
  const taken = new Set<Element>(); // quotes and list items used: skip what's inside them
  const seenText = new Set<string>();
  const seenImg = new Set<string>();
  let chars = 0;
  let images = 0;
  const inside = (e: Element) => {
    for (let p = e.parent as Element | null; p; p = p.parent as Element | null) if (taken.has(p)) return true;
    return false;
  };
  for (const e of els(box.children, (x) => ['h2', 'h3', 'p', 'blockquote', 'li', 'img'].includes(tag(x)))) {
    if (chars > MAX_READER_CHARS) break;
    if (inside(e)) continue;
    const t = tag(e);
    if (t === 'img') {
      let src = getAttributeValue(e, 'src') ?? '';
      if (!src || src.startsWith('data:')) src = getAttributeValue(e, 'data-src') ?? '';
      const abs = absolute(src, url);
      if (!abs || abs.endsWith('.svg') || tiny(getAttributeValue(e, 'width')) || tiny(getAttributeValue(e, 'height'))) continue;
      if (images < MAX_IMAGES && !seenImg.has(abs)) {
        seenImg.add(abs);
        blocks.push({ type: 'img', text: (getAttributeValue(e, 'alt') ?? '').trim(), src: abs });
        images++;
      }
      continue;
    }
    const s = text(e);
    const min = t === 'h2' || t === 'h3' ? 3 : t === 'li' ? 15 : 25;
    if (s.length < min || seenText.has(s)) continue;
    seenText.add(s);
    blocks.push({ type: t === 'blockquote' ? 'quote' : (t as ReaderBlock['type']), text: s, src: null });
    chars += s.length;
    if (t === 'blockquote' || t === 'li') taken.add(e);
  }
  return { title, siteName, blocks };
}

/** The article, or null when the page can't be loaded. */
export async function read(url: string): Promise<ParsedArticle | null> {
  try {
    const html = await get(url, 12_000, 'text/html,application/xhtml+xml');
    return parse(html.length > 3_000_000 ? html.slice(0, 3_000_000) : html, url);
  } catch {
    return null;
  }
}
