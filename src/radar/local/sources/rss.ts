import { fetchFeed, imageOf, type Entry } from '../feeds';
import { domainOf, toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * Any RSS or Atom feed you add to a topic (Phoronix, Fedora Magazine, a blog, a Substack…): everything
 * it posts becomes ARTICLE cards (so they join stories and the reader works), minus the topic's skip
 * words. Each feed is read at most every 2 hours.
 */

const EVERY = 2 * 3600_000;

/** "Fedora Magazine" from the feed's title would need a second parse: the site's name is good enough. */
const siteName = (url: string) => {
  const d = domainOf(url) ?? 'RSS';
  return d.replace(/^(feeds?|rss|blog)\./, '');
};

export function toItem(e: Entry, feedUrl: string): FetchedItem | null {
  const title = toPlainText(e.title);
  if (!title || !e.link?.startsWith('http')) return null;
  return item({
    type: 'ARTICLE',
    sourceName: siteName(e.link) || siteName(feedUrl),
    title,
    snippet: truncate(toPlainText(e.description), 300),
    url: e.link,
    thumbnailUrl: imageOf(e),
    author: e.author,
    publishedAt: e.published,
  });
}

export const rssFeeds: ContentSource = {
  id: 'rss',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    for (const url of topic.sources.feeds ?? []) {
      if (!/^https?:\/\//i.test(url) || !ctx.throttle.tryAcquire(`rss:${url}`, EVERY)) continue;
      try {
        for (const e of (await fetchFeed(url)).slice(0, 30)) {
          if (e.published && e.published < ctx.since) continue;
          const it = toItem(e, url);
          if (it) out.push(it);
        }
      } catch (e) {
        console.warn(`Radar: feed ${url} failed`, e);
      }
    }
    return out;
  },
};
