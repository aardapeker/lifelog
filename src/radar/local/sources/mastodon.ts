import { get } from '../feeds';
import { toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * Mastodon hashtags through the PUBLIC tag timeline of one instance: no token, no account (never
 * log in as the user: that's how Bluesky banned Radar). Skips boosts and bots, needs a minimum of
 * likes, keeps the most-liked few per tag, and links to the post's copy on this instance (small
 * home servers rate-limit visitors).
 */

const INSTANCE = 'https://mastodon.social';
const EVERY = 30 * 60_000; // per tag
const KEEP = 5; // most-liked per tag per run
const PAGES = 3;

type Status = {
  id: string;
  created_at: string;
  content: string;
  language: string | null;
  reblog: unknown;
  favourites_count: number;
  replies_count: number;
  account: { acct: string; display_name: string; avatar: string; bot: boolean };
  media_attachments: { type: string; preview_url: string | null }[];
};

export function toItem(s: Status): FetchedItem | null {
  const text = toPlainText(s.content);
  if (!text) return null;
  return item({
    type: 'POST',
    sourceName: 'Mastodon',
    title: truncate(text, 120)!, // posts have no headline: the start of the text
    snippet: truncate(text, 1000), // the whole post (the card shows this)
    url: `${INSTANCE}/@${s.account.acct}/${s.id}`,
    thumbnailUrl: s.media_attachments.find((m) => m.type === 'image')?.preview_url ?? null,
    author: `${s.account.display_name || s.account.acct} · @${s.account.acct}`,
    authorAvatarUrl: s.account.avatar,
    score: s.favourites_count,
    commentCount: s.replies_count,
    publishedAt: Date.parse(s.created_at) || null,
  });
}

export const mastodon: ContentSource = {
  id: 'mastodon',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    for (const raw of topic.sources.mastodonTags ?? []) {
      const tag = raw.replace(/^#/, '').trim();
      if (!tag || !ctx.throttle.tryAcquire(`mastodon:${tag.toLowerCase()}`, EVERY)) continue;
      try {
        const keep: Status[] = [];
        let maxId = '';
        for (let page = 0; page < PAGES; page++) {
          const list = JSON.parse(
            await get(`${INSTANCE}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=40${maxId ? `&max_id=${maxId}` : ''}`, 15_000, 'application/json'),
          ) as Status[];
          if (!list.length) break;
          for (const s of list) {
            if (Date.parse(s.created_at) < ctx.since) continue;
            if (s.reblog || s.account.bot || s.favourites_count < ctx.settings.mastodonMinLikes) continue;
            if (s.language && !ctx.settings.languages.includes(s.language)) continue;
            keep.push(s);
          }
          maxId = list[list.length - 1].id;
          if (Date.parse(list[list.length - 1].created_at) < ctx.since) break; // older pages are out of range
        }
        keep
          .sort((a, b) => b.favourites_count - a.favourites_count)
          .slice(0, KEEP)
          .forEach((s) => {
            const it = toItem(s);
            if (it) out.push(it);
          });
      } catch (e) {
        console.warn(`Radar: Mastodon #${tag} failed`, e);
      }
    }
    return out;
  },
};
