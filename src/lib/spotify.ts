import { fetch } from 'expo/fetch';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { AppState, Linking } from 'react-native';
import type { Tool } from './chat';
import { getSetting, setSetting } from './db';
import { waitMs } from './heartbeat';

/*
 * Spotify, with no server: you register your own Spotify app (Development Mode, free,
 * needs Premium) and paste its Client ID. Login is OAuth with PKCE, so there's no secret.
 * Tokens live in the Android keystore. Playback happens in the Spotify app on the phone;
 * Lifelog only presses its buttons (Spotify never gives apps the audio).
 */

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};
const API = 'https://api.spotify.com/v1';
// Spotify rejects plain custom schemes more and more; a reverse-domain one is what its docs show
export const SPOTIFY_REDIRECT = 'dev.arda.lifelog://spotify-auth';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'playlist-modify-private',
];
const CLIENT_KEY = 'spotify.clientId';
const TOKENS_KEY = 'spotify.tokens';

export type Track = { id: string; uri: string; name: string; artist: string; image: string | null; durationMs: number };
type Tokens = { access: string; refresh: string | null; expiresAt: number };

export class SpotifyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const getSpotifyClientId = () => SecureStore.getItemAsync(CLIENT_KEY);

export async function setSpotifyClientId(id: string): Promise<void> {
  const v = id.trim();
  if (v) await SecureStore.setItemAsync(CLIENT_KEY, v);
  else await SecureStore.deleteItemAsync(CLIENT_KEY);
}

async function loadTokens(): Promise<Tokens | null> {
  const raw = await SecureStore.getItemAsync(TOKENS_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

const saveTokens = (t: AuthSession.TokenResponse, previousRefresh: string | null = null) =>
  SecureStore.setItemAsync(
    TOKENS_KEY,
    JSON.stringify({
      access: t.accessToken,
      refresh: t.refreshToken ?? previousRefresh, // Spotify may or may not rotate it
      expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000,
    } satisfies Tokens),
  );

export const spotifyConnected = async () => !!(await loadTokens());

export async function disconnectSpotify(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKENS_KEY);
}

/** Opens Spotify's login in a browser tab and keeps the tokens. Returns false if you cancelled. */
export async function connectSpotify(): Promise<boolean> {
  const clientId = await getSpotifyClientId();
  if (!clientId) throw new Error('Paste your Spotify Client ID first.');
  const request = new AuthSession.AuthRequest({ clientId, scopes: SCOPES, redirectUri: SPOTIFY_REDIRECT, usePKCE: true });
  const result = await request.promptAsync(discovery);
  if (result.type === 'error') throw new Error(result.error?.message ?? result.params.error ?? 'Spotify login failed.');
  if (result.type !== 'success') return false;
  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri: SPOTIFY_REDIRECT,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );
  await saveTokens(tokens);
  return true;
}

async function accessToken(force = false): Promise<string> {
  const t = await loadTokens();
  if (!t) throw new SpotifyError(401, 'Spotify is not connected. Settings → Spotify.');
  if (!force && t.expiresAt - 60_000 > Date.now()) return t.access;
  const clientId = await getSpotifyClientId();
  if (!clientId || !t.refresh) throw new SpotifyError(401, 'Spotify login expired. Connect again in Settings.');
  const fresh = await AuthSession.refreshAsync({ clientId, refreshToken: t.refresh }, discovery);
  await saveTokens(fresh, t.refresh);
  return fresh.accessToken;
}

/** One Web API call. Refreshes the login once on 401. Returns null for "204 No Content". */
async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await accessToken(retried)}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && !retried) return api(path, init, true);
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try {
      msg = JSON.parse(text)?.error?.message ?? msg;
    } catch {}
    throw new SpotifyError(res.status, `Spotify ${res.status}: ${msg}`);
  }
  return text ? (JSON.parse(text) as T) : null;
}

type ApiTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album?: { images?: { url: string }[] };
};
const toTrack = (t: ApiTrack): Track => ({
  id: t.id,
  uri: t.uri,
  name: t.name,
  artist: t.artists.map((a) => a.name).join(', '),
  image: t.album?.images?.[t.album.images.length > 1 ? 1 : 0]?.url ?? null,
  durationMs: t.duration_ms,
});

export async function spotifyName(): Promise<string> {
  return (await api<{ display_name?: string; id: string }>('/me'))?.display_name ?? 'you';
}

/** Best match for "title" by "artist" (or a free-text query). */
export async function findTrack(title: string, artist = ''): Promise<Track | null> {
  const exact = artist ? `track:${title} artist:${artist}` : title;
  for (const q of [exact, `${title} ${artist}`.trim()]) {
    const res = await api<{ tracks: { items: ApiTrack[] } }>(`/search?type=track&limit=1&q=${encodeURIComponent(q)}`);
    const t = res?.tracks.items[0];
    if (t) return toTrack(t);
  }
  return null;
}

export async function getTrack(id: string): Promise<Track | null> {
  const t = await api<ApiTrack>(`/tracks/${encodeURIComponent(id)}`);
  return t ? toTrack(t) : null;
}

type Device = { id: string; name: string; type: string; is_active: boolean };
let lastDevice: string | null = null; // the phone's Spotify, once we've seen it

async function listDevices(): Promise<Device[]> {
  return (await api<{ devices: Device[] }>('/me/player/devices'))?.devices ?? [];
}

// the phone first (the radio lives on the phone), even if a computer or speaker is the active one
const pickDevice = (list: Device[]) =>
  list.find((d) => d.type === 'Smartphone' && d.is_active) ??
  list.find((d) => d.type === 'Smartphone') ??
  list.find((d) => d.is_active) ??
  list[0] ??
  null;

/**
 * Finds a Spotify device to play on. Spotify on a phone only counts as a device once it
 * has played something, so when none is awake and Lifelog is on screen (Android doesn't let a
 * background app open other apps), it opens `startWith` (a track) in the Spotify app, which
 * starts playing it, waits up to ~15 s for the phone to show up, then pauses it again so the
 * hosts can talk first.
 */
export async function wakeSpotify(startWith?: string): Promise<string | null> {
  const found = pickDevice(await listDevices().catch(() => []));
  if (found) return (lastDevice = found.id);
  if (AppState.currentState !== 'active') return lastDevice;
  await Linking.openURL(startWith ?? 'spotify:').catch(() => {});
  for (let k = 0; k < 10; k++) {
    await waitMs(1500);
    const d = pickDevice(await listDevices().catch(() => []));
    if (d) {
      lastDevice = d.id;
      if (startWith) await api(`/me/player/pause?device_id=${d.id}`, { method: 'PUT' }).catch(() => {});
      return d.id;
    }
  }
  return null;
}

/** Makes `device` the one Spotify plays on (it may be listed but not active). */
export const transferTo = (device: string) =>
  api('/me/player', { method: 'PUT', body: { device_ids: [device], play: false } }).catch(() => {});

/**
 * Plays tracks (in order, as a queue) in the Spotify app. Always names the device, so a
 * phone Spotify that dozed off during the hosts' talk still gets the command. If Spotify says
 * there's no such device, finds one, moves playback to it and tries again; as a last resort
 * (only possible while Lifelog is on screen) opens the first track in Spotify.
 */
export async function playTracks(uris: string[]): Promise<void> {
  const play = (device: string | null) =>
    api(`/me/player/play${device ? `?device_id=${device}` : ''}`, { method: 'PUT', body: { uris } });
  try {
    await play(lastDevice);
    return;
  } catch (e) {
    if (!(e instanceof SpotifyError) || (e.status !== 404 && e.status !== 502)) throw e;
  }
  const listed = pickDevice(await listDevices().catch(() => []));
  if (listed) {
    lastDevice = listed.id;
    await transferTo(listed.id);
    await waitMs(800);
    await play(listed.id);
    return;
  }
  const device = await wakeSpotify(uris[0]);
  if (!device) throw new SpotifyError(404, 'Spotify is asleep on your phone. Play any song in Spotify for a second, come back and tap ▶.');
  await play(device);
}

/** Moves playback to the phone's Spotify (if we know it), for a second try. */
export async function nudgeSpotify(): Promise<void> {
  const d = pickDevice(await listDevices().catch(() => []));
  if (!d) return;
  lastDevice = d.id;
  await transferTo(d.id);
}

/** What Spotify reports right now, in one line, for error messages: "where" and "what". */
export async function spotifyReport(): Promise<string> {
  const [devices, p] = await Promise.all([
    listDevices().catch(() => [] as Device[]),
    api<{ is_playing: boolean; device?: { name: string }; item?: { name: string } | null }>('/me/player').catch(() => null),
  ]);
  const where = devices.length
    ? devices.map((d) => `${d.name} (${d.type}${d.is_active ? ', active' : ''})`).join(', ')
    : 'no devices';
  const what = p ? `${p.is_playing ? 'playing' : 'paused'} "${p.item?.name ?? '?'}" on ${p.device?.name ?? '?'}` : 'nothing loaded';
  return `Spotify sees: ${where}. Player: ${what}.`;
}

/** The same song? Spotify sometimes plays an equivalent track with a different id. */
export const sameTrack = (a: Pick<Track, 'uri' | 'name' | 'artist'> | null | undefined, b: Pick<Track, 'uri' | 'name' | 'artist'>) =>
  !!a &&
  (a.uri === b.uri ||
    (a.name.toLocaleLowerCase('tr') === b.name.toLocaleLowerCase('tr') &&
      a.artist.split(',')[0].trim().toLocaleLowerCase('tr') === b.artist.split(',')[0].trim().toLocaleLowerCase('tr')));

export const pausePlayback = () => api('/me/player/pause', { method: 'PUT' }).then(() => {});
export const resumePlayback = () => api('/me/player/play', { method: 'PUT' }).then(() => {});

export type Playback = { isPlaying: boolean; progressMs: number; track: Track | null };

export async function playbackState(): Promise<Playback | null> {
  const p = await api<{ is_playing: boolean; progress_ms: number | null; item: ApiTrack | null }>('/me/player');
  if (!p) return null;
  return { isPlaying: p.is_playing, progressMs: p.progress_ms ?? 0, track: p.item?.uri?.startsWith('spotify:track:') ? toTrack(p.item) : null };
}

/** What you're listening to now, or what you played in the last 30 minutes. */
export async function currentSong(): Promise<Track | null> {
  const now = await api<{ item: ApiTrack | null }>('/me/player/currently-playing');
  if (now?.item?.uri?.startsWith('spotify:track:')) return toTrack(now.item);
  const recent = await api<{ items: { track: ApiTrack; played_at: string }[] }>('/me/player/recently-played?limit=1');
  const last = recent?.items[0];
  return last && Date.now() - Date.parse(last.played_at) < 30 * 60_000 ? toTrack(last.track) : null;
}

/** Saves tracks as a private playlist and returns its link. */
export async function savePlaylist(name: string, description: string, uris: string[]): Promise<string> {
  const pl = await api<{ id: string; external_urls: { spotify: string } }>('/me/playlists', {
    method: 'POST',
    body: { name, description, public: false },
  });
  if (!pl) throw new Error('Spotify did not create the playlist.');
  await api(`/playlists/${pl.id}/items`, { method: 'POST', body: { uris } });
  return pl.external_urls.spotify;
}

/** Your top artists (refreshed once a day), so the friend knows your taste. Empty if not connected. */
export async function musicTaste(db: SQLiteDatabase): Promise<string[]> {
  if (!(await spotifyConnected())) return [];
  const today = new Date().toDateString();
  try {
    const cached = JSON.parse(await getSetting(db, 'spotify.taste', '{}')) as { day?: string; artists?: string[] };
    if (cached.day === today && cached.artists) return cached.artists;
    const res = await api<{ items: { name: string }[] }>('/me/top/artists?limit=15&time_range=medium_term');
    const artists = res?.items.map((a) => a.name) ?? [];
    await setSetting(db, 'spotify.taste', JSON.stringify({ day: today, artists }));
    return artists;
  } catch {
    return [];
  }
}

/** Parses "Title - Artist" lines (what the AI writes) into search pairs. */
export function parseSongLines(text: string): { title: string; artist: string }[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, '').trim()) // list markers, not a song called "22"
    .filter(Boolean)
    .map((l) => {
      const [title, ...rest] = l.split(/\s+[-–—]\s+/);
      return { title: title.trim().replace(/^["“]|["”]$/g, ''), artist: rest.join(' - ').trim() };
    })
    .filter((s) => s.title);
}

/** A link the chat turns into a ▶ button. */
export const playLink = (t: Track) => `lifelog://play/${t.id}`;

/** Lets the friend turn song ideas into real, playable Spotify tracks. */
export function songsTool(): Tool {
  return {
    name: 'find_songs',
    description:
      'Find songs on Spotify so the user can play them with one tap. Returns each match with a lifelog://play link ' +
      'to copy into your reply exactly, on its own line.',
    parameters: {
      type: 'object',
      properties: { songs: { type: 'string', description: 'One song per line, as "Title - Artist". Up to 8.' } },
      required: ['songs'],
    },
    run: async (args) => {
      const wanted = parseSongLines(String(args.songs ?? '')).slice(0, 8);
      const lines: string[] = [];
      for (const s of wanted) {
        const t = await findTrack(s.title, s.artist).catch(() => null);
        lines.push(t ? `${t.name} - ${t.artist}\n${playLink(t)}` : `${s.title}: not on Spotify`);
      }
      return lines.join('\n\n') || 'No songs given.';
    },
  };
}
