import { childText, fetchFeed, type Entry } from '../feeds';
import { NOT_WORD, toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * arXiv papers for topics with "arXiv papers" on (port of the backend's ArxivSource): the daily
 * category feeds (rss.arxiv.org/rss/cs.AI…) are read once per 6 hours for all topics, then each
 * topic keeps the papers whose title or abstract has one of its keywords as a whole word, at most
 * 10 per run. "replace" announcements (new versions of old papers) are skipped. Weekends are quiet.
 * A 429 just ends that round (the next is 6 hours later anyway). (arXiv's query API 429s even single calls: the feeds only.)
 */

const CATEGORIES = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.SE', 'cs.OS', 'cs.CR'];
const EVERY = 6 * 3600_000;
const MAX_PER_TOPIC = 10;

type Paper = { item: FetchedItem; words: Set<string> };
let papers: Paper[] = []; // this run's copy, shared by all topics (the throttle is kept across runs)

const wordsOf = (s: string) => new Set(s.toLowerCase().split(NOT_WORD).filter(Boolean));

export function toPaper(e: Entry): Paper | null {
  const title = toPlainText(e.title);
  if (!title || !e.link) return null;
  if ((childText(e.el, 'arxiv:announce_type') ?? 'new').startsWith('replace')) return null;
  // the description is "arXiv:2511.01234v1 Announce Type: new Abstract: …"
  const abstract = toPlainText(e.description)?.replace(/^.*?Abstract:\s*/i, '') ?? null;
  const authors = childText(e.el, 'dc:creator');
  return {
    item: item({
      type: 'PAPER',
      sourceName: 'arXiv',
      title,
      snippet: truncate(abstract, 300),
      url: e.link,
      author: authors ? truncate(authors.split(',').slice(0, 3).join(',') + (authors.split(',').length > 3 ? ' et al.' : ''), 120) : null,
      publishedAt: e.published,
    }),
    words: wordsOf(`${title} ${abstract ?? ''}`),
  };
}

/** A keyword as whole words: "large language model" needs all three, "llm" just itself. */
const hasKeyword = (p: Paper, keyword: string) => {
  const parts = keyword.toLowerCase().split(NOT_WORD).filter(Boolean);
  return parts.length > 0 && parts.every((w) => p.words.has(w));
};

async function refresh(): Promise<void> {
  const next: Paper[] = [];
  for (const cat of CATEGORIES) {
    try {
      for (const e of await fetchFeed(`https://rss.arxiv.org/rss/${cat}`)) {
        const p = toPaper(e);
        if (p && !next.some((x) => x.item.url === p.item.url)) next.push(p); // a paper can be in several categories
      }
    } catch (e) {
      if (String(e).includes('429')) break; // the throttle already keeps it quiet for 6 hours
      console.warn(`Radar: arXiv ${cat} failed`, e);
    }
  }
  if (next.length) papers = next;
}

export const arxiv: ContentSource = {
  id: 'arxiv',
  async fetch(topic, ctx) {
    if (!topic.sources.arxiv) return [];
    if (ctx.throttle.tryAcquire('arxiv:feeds', EVERY)) await refresh(); // once per 6 h, for every topic
    return papers
      .filter((p) => topic.keywords.some((k) => hasKeyword(p, k)))
      .slice(0, MAX_PER_TOPIC)
      .map((p) => p.item);
  },
};
