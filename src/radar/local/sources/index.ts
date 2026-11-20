import { arxiv } from './arxiv';
import { bingNews } from './bing';
import { devto } from './devto';
import { githubReleases } from './github';
import { hackerNews } from './hackerNews';
import { mastodon } from './mastodon';
import { rssFeeds } from './rss';
import { f1 } from './f1';
import { musicBrainz } from './musicbrainz';
import { onThisDay } from './onThisDay';
import { quakes } from './quakes';
import { tmdb } from './tmdb';
import type { ContentSource } from './types';
import { youtube } from './youtube';

/** Every platform Radar reads (on the phone). Adding one = writing one ContentSource and listing it here. */
export const SOURCES: ContentSource[] = [bingNews, hackerNews, youtube, githubReleases, mastodon, rssFeeds, devto, arxiv, tmdb, musicBrainz, quakes, f1, onThisDay];
