import { tmdbCall } from './sources/tmdb';

/*
 * Everything the movie page shows, from ONE TMDB call (append_to_response): details, credits,
 * the trailer, Turkish age rating, where to watch in Turkey (JustWatch data) and similar titles.
 * Fetched when a page opens and kept in a small memory cache, never in the database.
 * No React Native in here: the mapping is tested with plain scripts.
 */

export type Kind = 'movie' | 'tv';
export type Person = { id: number; name: string; role: string; photo: string | null };
export type Title = { id: number; kind: Kind; title: string; poster: string | null; year: string | null };
export type Provider = { name: string; logo: string | null };

export type MovieDetails = {
  id: number;
  kind: Kind;
  title: string;
  tagline: string | null;
  year: string | null;
  runtime: number | null; // minutes (per episode for series)
  certification: string | null; // "13+", "PG-13"
  rating: number | null; // 0–10, one decimal
  votes: number;
  genres: string[];
  overview: string | null;
  poster: string | null;
  backdrop: string | null;
  makers: { label: string; names: string[] }; // "Director" / "Created by"
  cast: Person[];
  trailer: string | null; // a YouTube video id
  watch: { stream: Provider[]; rent: Provider[]; link: string | null };
  similar: Title[];
  series: { seasons: number; episodes: number; next: string | null; status: string | null } | null;
  url: string; // the TMDB page
};

const IMG = 'https://image.tmdb.org/t/p/';
const img = (path: string | null | undefined, size: string) => (path ? `${IMG}${size}${path}` : null);

/** "https://www.themoviedb.org/tv/1399" → { kind: 'tv', id: 1399 } (a MOVIE card's link). */
export function parseTmdbUrl(url: string): { kind: Kind; id: number } | null {
  const m = url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
  return m ? { kind: m[1] as Kind, id: Number(m[2]) } : null;
}

type Raw = Record<string, any>; // TMDB's JSON, read field by field below

/** The rating for Turkey, else the US one (TMDB has both for most titles). */
function certification(raw: Raw, kind: Kind): string | null {
  const pick = (cc: string) => {
    if (kind === 'tv') return (raw.content_ratings?.results ?? []).find((r: Raw) => r.iso_3166_1 === cc)?.rating || null;
    const dates = (raw.release_dates?.results ?? []).find((r: Raw) => r.iso_3166_1 === cc)?.release_dates ?? [];
    return dates.map((d: Raw) => d.certification).find((c: string) => c) || null;
  };
  return pick('TR') ?? pick('US');
}

/** The official YouTube trailer, else any trailer, else a teaser. */
function trailer(raw: Raw): string | null {
  const vids: Raw[] = (raw.videos?.results ?? []).filter((v: Raw) => v.site === 'YouTube' && v.key);
  const best = vids.find((v) => v.type === 'Trailer' && v.official) ?? vids.find((v) => v.type === 'Trailer') ?? vids.find((v) => v.type === 'Teaser');
  return best?.key ?? null;
}

const providers = (list: Raw[] | undefined): Provider[] =>
  (list ?? []).slice(0, 8).map((p) => ({ name: p.provider_name, logo: img(p.logo_path, 'w92') }));

export function toDetails(raw: Raw, kind: Kind): MovieDetails {
  const tv = kind === 'tv';
  const date: string | undefined = tv ? raw.first_air_date : raw.release_date;
  const crew: Raw[] = raw.credits?.crew ?? [];
  const tr = raw['watch/providers']?.results?.TR;
  const next = raw.next_episode_to_air;
  return {
    id: raw.id,
    kind,
    title: (tv ? raw.name : raw.title) ?? raw.original_title ?? raw.original_name ?? '',
    tagline: raw.tagline || null,
    year: date ? date.slice(0, 4) : null,
    runtime: (tv ? raw.episode_run_time?.[0] : raw.runtime) || null,
    certification: certification(raw, kind),
    rating: raw.vote_count >= 20 ? Math.round(raw.vote_average * 10) / 10 : null,
    votes: raw.vote_count ?? 0,
    genres: (raw.genres ?? []).map((g: Raw) => g.name),
    overview: raw.overview || null,
    poster: img(raw.poster_path, 'w342'),
    backdrop: img(raw.backdrop_path, 'w780'),
    makers: tv
      ? { label: 'Created by', names: (raw.created_by ?? []).map((p: Raw) => p.name) }
      : { label: 'Director', names: crew.filter((c) => c.job === 'Director').map((c) => c.name) },
    cast: (raw.credits?.cast ?? []).slice(0, 15).map((c: Raw) => ({ id: c.id, name: c.name, role: c.character ?? '', photo: img(c.profile_path, 'w185') })),
    trailer: trailer(raw),
    watch: { stream: providers(tr?.flatrate), rent: providers([...(tr?.rent ?? []), ...(tr?.buy ?? [])].filter((p, i, a) => a.findIndex((x) => x.provider_id === p.provider_id) === i)), link: tr?.link ?? null },
    similar: ((raw.recommendations?.results?.length ? raw.recommendations.results : raw.similar?.results) ?? [])
      .filter((s: Raw) => s.poster_path)
      .slice(0, 12)
      .map((s: Raw) => ({ id: s.id, kind, title: (tv ? s.name : s.title) ?? '', poster: img(s.poster_path, 'w185'), year: ((tv ? s.first_air_date : s.release_date) ?? '').slice(0, 4) || null })),
    series: tv
      ? {
          seasons: raw.number_of_seasons ?? 0,
          episodes: raw.number_of_episodes ?? 0,
          next: next?.air_date ? `S${next.season_number} E${next.episode_number} · ${next.air_date}` : null,
          status: raw.status ?? null,
        }
      : null,
    url: `https://www.themoviedb.org/${kind}/${raw.id}`,
  };
}

const cache = new Map<string, MovieDetails>();

/** One title's page, from the cache when it was opened lately. */
export async function movieDetails(kind: Kind, id: number, key: string): Promise<MovieDetails> {
  const k = `${kind}:${id}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const extra = kind === 'tv' ? 'credits,videos,watch/providers,recommendations,similar,content_ratings' : 'credits,videos,watch/providers,recommendations,similar,release_dates';
  const details = toDetails(await tmdbCall<Raw>(`/${kind}/${id}?append_to_response=${extra}`, key), kind);
  cache.set(k, details);
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
  return details;
}
