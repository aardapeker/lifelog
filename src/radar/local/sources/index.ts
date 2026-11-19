import { arxiv } from './arxiv';
import { bingNews } from './bing';
import { devto } from './devto';
import { githubReleases } from './github';
import { hackerNews } from './hackerNews';
import { mastodon } from './mastodon';
import { rssFeeds } from './rss';
import { tmdb } from './tmdb';
import type { ContentSource } from './types';
import { youtube } from './youtube';

/** Every platform Radar reads (on the phone). Adding one = writing one ContentSource and listing it here. */
export const SOURCES: ContentSource[] = [bingNews, hackerNews, youtube, githubReleases, mastodon, rssFeeds, devto, arxiv, tmdb];
