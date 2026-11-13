import { childText, fetchFeed, type Entry } from '../feeds';
import { repeats, toPlainText, truncate } from '../text';
import { item, orQuery, type ContentSource, type FetchedItem } from './types';

/*
 * Bing News search RSS: free, no API key, and unlike Google News every item has the real publisher
 * URL (the "url" param of its apiclick link) and a thumbnail (News:Image). One market per language.
 */

const MARKETS: Record<string, string> = { en: 'en-US', tr: 'tr-TR', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', nl: 'nl-NL', ja: 'ja-JP', ar: 'ar-SA', ru: 'ru-RU' };
export const market = (lang: string) => MARKETS[lang] ?? `${lang}-${lang.toUpperCase()}`;

/** bing.com/news/apiclick.aspx?…&url=https%3a%2f%2fwww.theverge.com%2f… → https://www.theverge.com/… */
export function publisherUrl(link: string | null): string | null {
  if (!link || !link.includes('apiclick.aspx')) return link;
  const m = link.match(/[?&]url=([^&]+)/);
  if (!m) return link;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return link;
  }
}

/** Bing's thumbnail service: force https and ask for a card-sized, smart-cropped image. */
export function thumbnail(image: string | null): string | null {
  if (!image?.trim()) return null;
  const https = image.replace(/^http:\/\//, 'https://');
  return https.includes('bing.com/th') ? `${https}&w=640&h=360&c=7` : https;
}

export function toItems(entries: Entry[], since: number): FetchedItem[] {
  const out: FetchedItem[] = [];
  for (const e of entries) {
    if (e.published && e.published < since) continue;
    const title = toPlainText(e.title);
    const url = publisherUrl(e.link);
    if (!title || !url) continue;
    let snippet = toPlainText(e.description);
    if (repeats(snippet, title)) snippet = null;
    out.push(
      item({
        type: 'ARTICLE',
        sourceName: childText(e.el, 'news:source') ?? 'Bing News',
        title,
        snippet: truncate(snippet, 300),
        url,
        thumbnailUrl: thumbnail(childText(e.el, 'news:image')),
        publishedAt: e.published,
      }),
    );
  }
  return out;
}

export const bingNews: ContentSource = {
  id: 'bing-news',
  async fetch(topic, ctx) {
    const merged = new Map<string, FetchedItem>();
    for (const lang of ctx.settings.languages) {
      const url = `https://www.bing.com/news/search?q=${encodeURIComponent(orQuery(topic))}&format=rss&mkt=${market(lang)}`;
      try {
        for (const it of toItems(await fetchFeed(url), ctx.since)) if (!merged.has(it.url)) merged.set(it.url, it);
      } catch (e) {
        console.warn(`Radar: Bing News (${lang}) failed for ${topic.slug}`, e);
      }
    }
    return [...merged.values()];
  },
};
