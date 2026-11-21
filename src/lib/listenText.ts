/*
 * The pure parts of your listening history (no database, no network), so they can be tested:
 * reading Spotify's "Extended streaming history" files, and saying a song's history in words.
 */

export type Listen = { trackId: string; name: string; artist: string; playedAt: number; msPlayed: number | null; source: 'api' | 'import' };

/** Plays shorter than this don't count (Spotify's own rule for "a play"). */
export const MIN_PLAY_MS = 30_000;
/** One play from both sources (Lifelog's saving and the import) lands in the same 2-minute slot. */
export const slotOf = (playedAt: number) => Math.floor(playedAt / 120_000);

/**
 * One Extended streaming history file (a JSON array) → the songs in it. Podcasts, videos and plays
 * under 30 s are left out. The format: ts, ms_played, master_metadata_track_name,
 * master_metadata_album_artist_name, spotify_track_uri.
 */
export function parseHistory(json: unknown): Listen[] {
  if (!Array.isArray(json)) return [];
  const out: Listen[] = [];
  for (const r of json as Record<string, any>[]) {
    const uri: string | undefined = r?.spotify_track_uri;
    if (!uri?.startsWith('spotify:track:') || !r.master_metadata_track_name) continue;
    const ms = Number(r.ms_played) || 0;
    if (ms < MIN_PLAY_MS) continue;
    const at = Date.parse(r.ts);
    if (Number.isNaN(at)) continue;
    out.push({
      trackId: uri.slice('spotify:track:'.length),
      name: r.master_metadata_track_name,
      artist: r.master_metadata_album_artist_name ?? '',
      playedAt: at,
      msPlayed: ms,
      source: 'import',
    });
  }
  return out;
}

/** The files in the export that hold music plays (the zip also has video and podcast files). */
export const isAudioHistory = (name: string) => /Streaming_History_Audio.*\.json$/i.test(name) || /(^|\/)StreamingHistory_?music.*\.json$/i.test(name);

export type SongHistory = { plays: number; week: number; lastAt: number | null };

const DAY = 86_400_000;
const ago = (ms: number) => {
  const d = Math.round(ms / DAY);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 730) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} years ago`;
};

/**
 * A song's history for the show's writer, in words: "played 9 times this week", "not played for 3 weeks
 * (52 plays before)", "never played before". `since` = how far back the history goes: with less than
 * two weeks of it, a song it doesn't know isn't called new (it may just predate the history).
 */
export function historyLine(h: SongHistory | undefined, since: number | null, now = Date.now()): string {
  const covered = since != null && now - since >= 14 * DAY;
  if (!h || !h.plays) return covered ? 'they have never played it before' : '';
  if (h.week >= 4) return `they played it ${h.week} times this week (${h.plays} in total)`;
  if (h.lastAt != null && now - h.lastAt >= 14 * DAY) return `they haven't played it for ${ago(now - h.lastAt).replace(' ago', '')} (${h.plays} plays before)`;
  if (h.plays === 1) return `they played it once, ${ago(now - (h.lastAt ?? now))}`;
  return `they played it ${h.plays} times, last ${ago(now - (h.lastAt ?? now))}`;
}
