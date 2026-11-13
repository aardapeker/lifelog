import { bingNews } from './bing';
import { githubReleases } from './github';
import { hackerNews } from './hackerNews';
import { mastodon } from './mastodon';
import type { ContentSource } from './types';
import { youtube } from './youtube';

/** Every platform Radar reads (on the phone). Adding one = writing one ContentSource and listing it here. */
export const SOURCES: ContentSource[] = [bingNews, hackerNews, youtube, githubReleases, mastodon];
