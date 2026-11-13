import { fetchFeed, type Entry } from '../feeds';
import { toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * New versions of the topic's GitHub repos via the public releases.atom feed, falling back to
 * tags.atom for projects that only tag (torvalds/linux). No token, no login.
 */

const EVERY = 6 * 3600_000;

export function toItem(e: Entry, repo: string): FetchedItem | null {
  const version = toPlainText(e.title);
  if (!version || !e.link) return null;
  const name = repo.slice(repo.indexOf('/') + 1);
  return item({
    type: 'RELEASE',
    sourceName: 'GitHub',
    title: version.toLowerCase().includes(name.toLowerCase()) ? version : `${repo} ${version}`,
    snippet: truncate(toPlainText(e.description), 300),
    url: e.link.startsWith('http') ? e.link : `https://github.com${e.link}`,
    author: e.author,
    publishedAt: e.published,
  });
}

export const githubReleases: ContentSource = {
  id: 'github',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    for (const repo of topic.sources.githubRepos ?? []) {
      if (!ctx.throttle.tryAcquire(`github:${repo}`, EVERY)) continue;
      try {
        let entries = await fetchFeed(`https://github.com/${repo}/releases.atom`);
        if (!entries.length) entries = await fetchFeed(`https://github.com/${repo}/tags.atom`);
        for (const e of entries) {
          if (e.published && e.published < ctx.since) continue;
          const it = toItem(e, repo);
          if (it) out.push(it);
        }
      } catch (e) {
        console.warn(`Radar: GitHub ${repo} failed`, e);
      }
    }
    return out;
  },
};
