import { getAttributeValue } from 'domutils';
import { childText, deep, fetchFeed, get, type Entry } from '../feeds';
import { toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * YouTube without an API key: each topic lists channels ("@handle" or a "UC…" id), and every
 * channel has a public Atom feed of its latest videos. A handle is turned into its channel id once
 * (from the channel page) and remembered. Shorts come with /shorts/ links.
 */

const EVERY = 60 * 60_000; // per channel

/** "@TheLinuxEXP" → "UC5UAwBUum7CPN5buc-_N1Fw" (read from the channel page, cached). */
async function channelId(ref: string, cache: Record<string, string>): Promise<string | null> {
  const r = ref.trim();
  if (/^UC[\w-]{22}$/.test(r)) return r;
  const fromUrl = r.match(/channel\/(UC[\w-]{22})/);
  if (fromUrl) return fromUrl[1];
  const handle = r.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@?/, '@').split(/[/?]/)[0];
  const key = `yt:${handle.toLowerCase()}`;
  if (cache[key]) return cache[key];
  const html = await get(`https://www.youtube.com/${handle}`, 15_000, 'text/html');
  const id =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ??
    null;
  if (id) cache[key] = id;
  return id;
}

export function toItem(e: Entry): FetchedItem | null {
  const title = toPlainText(e.title);
  if (!title || !e.link) return null;
  const group = deep(e.el, 'media:group');
  const thumb = group && deep(group, 'media:thumbnail');
  const stats = group && deep(group, 'media:statistics');
  const short = e.link.includes('/shorts/');
  return item({
    type: short ? 'SHORT' : 'VIDEO',
    sourceName: 'YouTube',
    title,
    snippet: truncate(group ? toPlainText(childText(group, 'media:description')) : null, 300),
    url: e.link,
    thumbnailUrl: thumb ? (getAttributeValue(thumb, 'url') ?? null) : null,
    author: e.author,
    score: stats ? Number(getAttributeValue(stats, 'views') ?? 0) || null : null,
    publishedAt: e.published,
  });
}

export const youtube: ContentSource = {
  id: 'youtube',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    for (const ref of topic.sources.youtubeChannels ?? []) {
      if (!ctx.throttle.tryAcquire(`youtube:${ref}`, EVERY)) continue;
      try {
        const id = await channelId(ref, ctx.cache);
        if (!id) {
          console.warn(`Radar: no YouTube channel found for ${ref}`);
          continue;
        }
        for (const e of await fetchFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)) {
          if (e.published && e.published < ctx.since) continue;
          const it = toItem(e);
          if (it) out.push(it);
        }
      } catch (e) {
        console.warn(`Radar: YouTube ${ref} failed`, e);
      }
    }
    return out;
  },
};
