# Radar inside Lifelog

Radar (github.com/aardapeker/radar) is Arda's topic news feed: follow topics, not people. It has a
Spring Boot backend, but no home server yet, so since Nov 2026 it also lives **here, as a sub-app**,
with the phone acting as its server. When the server exists, it moves back out.

## Keep it separable
- Everything is in `src/radar/` (plus the routes in `src/app/radar/`, the `RadarCard` on the Life tab,
  one line in `lib/background.ts`, one in `lib/notify.ts`, and migration v11 in `lib/db.ts`).
  Radar code doesn't import Lifelog code except: the SQLite db, `lib/db` settings, `lib/chat`
  (`geminiFirst` for TL;DRs), `lib/notify` (the digest) and the `Icon` component.
- **Screens only talk to `RadarBackend`** (`backend.ts`), via `useRadar()`. Today that's
  `local/` (fetches the feeds itself, SQLite tables `radar_*`). Later: an `ApiBackend` with the same
  methods calling the server's REST API, returned from `useRadar()`; the screens don't change.
- `types.ts`, `format.ts`, `theme.ts` and `components/` are copies/ports of the radar repo
  (`shared/api/types.ts`, `shared/format.ts`, `mobile/src/theme.ts`, `mobile/src/components/`).
  Keep them in step. Inside Lifelog, Radar wears Lifelog's look: `theme.ts` keeps the radar repo's
  token names but points them at `lib/theme`, and `Pill`/`Header` use Lifelog's glass buttons, chips
  and icon buttons (the standalone Radar app keeps its own ink-and-orange).

## The on-phone backend (`local/`)
Ports of the Java services:
- `sources/`: one `ContentSource` per platform (Bing News RSS, Hacker News Algolia, YouTube channel
  feeds, GitHub releases/tags Atom, Mastodon public tag timelines). No accounts, ever (Bluesky banned
  Radar for logging in as Arda; see the radar repo's CLAUDE.md). YouTube has no API key here, so
  topics list channels (`@handle` or `UC…` id) instead of keyword search.
- `ingest.ts`: IngestionService (exclude words, dedupe by topic+url, Latin-script filter, story
  grouping within 48 h via `stories.ts` = StoryMatcher, 30-day retention for unsaved items).
- `reader.ts`: ArticleText (htmlparser2 instead of jsoup). `index.ts`: SummaryService (TL;DR,
  cached on the item), StoryArticles (first readable source, paywall stats per site), DigestService.
- The background job (`radarJob`, every ~2 h with Lifelog's others) refreshes and sends the morning
  digest once a day after the chosen time.
