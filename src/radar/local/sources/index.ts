import { arxiv } from './arxiv';
import { bingNews } from './bing';
import { deezer } from './deezer';
import { devto } from './devto';
import { githubReleases } from './github';
import { hackerNews } from './hackerNews';
import { mastodon } from './mastodon';
import { rssFeeds } from './rss';
import { f1 } from './f1';
import { onThisDay } from './onThisDay';
import { quakes } from './quakes';
import { steamGames } from './steam';
import { tmdb } from './tmdb';
import { tvShows } from './tvmaze';
import type { ContentSource } from './types';
import { youtube } from './youtube';

/** Every platform Radar reads (on the phone). Adding one = writing one ContentSource and listing it here. */
export const SOURCES: ContentSource[] = [bingNews, hackerNews, youtube, githubReleases, mastodon, rssFeeds, devto, arxiv, tmdb, tvShows, steamGames, deezer, quakes, f1, onThisDay];
