import type { Element } from 'domhandler';
import { findAll, getAttributeValue, textContent } from 'domutils';
import { parseDocument } from 'htmlparser2';

/*
 * RSS and Atom, read with htmlparser2 in XML mode (the backend used ROME). Also the one place that
 * fetches over the network for the sources, with a browser-like user agent and a timeout.
 */

export const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

export async function get(url: string, timeoutMs = 15_000, accept = '*/*'): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} from ${url.match(/^https?:\/\/([^/?#]+)/)?.[1] ?? url}`); // RN's URL has no .host
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export type Entry = {
  title: string | null;
  link: string | null;
  description: string | null; // RSS description / Atom summary or content (HTML)
  published: number | null; // ms
  author: string | null;
  /** child elements by lower-case name ("news:image", "media:group"…) */
  el: Element;
};

const lower = (e: Element) => e.name.toLowerCase();
const child = (e: Element, name: string) => e.children.find((c): c is Element => (c as Element).name?.toLowerCase() === name) ?? null;
export const childText = (e: Element, name: string): string | null => {
  const c = child(e, name);
  const t = c ? textContent(c).trim() : '';
  return t || null;
};
export const childAttr = (e: Element, name: string, attr: string): string | null => {
  const c = child(e, name);
  return c ? (getAttributeValue(c, attr) ?? null) : null;
};
/** A nested element anywhere inside, by lower-case name. */
export const deep = (e: Element, name: string): Element | null =>
  findAll((x) => x.name.toLowerCase() === name, e.children)[0] ?? null;

function date(s: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Entries of an RSS 2.0 or Atom document. */
export function parseFeed(xml: string): Entry[] {
  const doc = parseDocument(xml, { xmlMode: true, decodeEntities: true });
  const items = findAll((e) => lower(e) === 'item' || lower(e) === 'entry', doc.children);
  return items.map((e) => {
    // Atom: <link href=…> (rel=alternate preferred); RSS: <link>text</link>
    const atomLinks = e.children.filter((c): c is Element => (c as Element).name?.toLowerCase() === 'link' && !!getAttributeValue(c as Element, 'href'));
    const atomLink = (atomLinks.find((l) => (getAttributeValue(l, 'rel') ?? 'alternate') === 'alternate') ?? atomLinks[0]) as Element | undefined;
    const link = atomLink ? getAttributeValue(atomLink, 'href') ?? null : childText(e, 'link');
    const a = child(e, 'author'); // Atom: <author><name>…</name></author>; RSS: text or <dc:creator>
    const author = a ? childText(a, 'name') ?? (textContent(a).trim() || null) : childText(e, 'dc:creator');
    return {
      title: childText(e, 'title'),
      link,
      description: childText(e, 'description') ?? childText(e, 'content') ?? childText(e, 'summary') ?? childText(e, 'content:encoded'),
      published: date(childText(e, 'pubdate') ?? childText(e, 'published') ?? childText(e, 'updated') ?? childText(e, 'dc:date')),
      author,
      el: e,
    };
  });
}

export async function fetchFeed(url: string): Promise<Entry[]> {
  return parseFeed(await get(url, 15_000, 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8'));
}

/** At most once per interval per key (like the backend's Throttle), remembered across runs. */
export class Throttle {
  constructor(private last: Record<string, number>) {}
  tryAcquire(key: string, intervalMs: number): boolean {
    const now = Date.now();
    if ((this.last[key] ?? 0) + intervalMs > now) return false;
    this.last[key] = now;
    return true;
  }
  get state() {
    return this.last;
  }
}
