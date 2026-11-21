import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '../../components/Icon';
import { fansText, trackTime, type DzArtist, type DzRelease, type DzTrack } from '../../lib/deezer';
import { radioAudioMode } from '../../lib/tts';
import { colors, fonts, mono } from '../theme';
import { RemoteImage } from './RemoteImage';

/*
 * Deezer's 30-second previews, like Spotify's: tap a song to hear it, tap again to stop. One plays
 * at a time in the whole app; it takes the audio focus (Android pauses Spotify, like any player
 * would) and gives it back when it ends. Leaving the page stops it.
 */

type State = { key: string | null; progress: number };
let state: State = { key: null, progress: 0 };
let player: AudioPlayer | null = null;
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

let tap = 0; // bumped by every play and stop: a slower, older request must not play after a newer tap
let wanted: string | null = null; // the song the last tap asked for (its link may still be loading)

/** Let go of the player (the audio focus goes back to the radio's mixing). */
function release(): void {
  const p = player;
  player = null;
  if (p) {
    try {
      p.pause();
      p.remove();
    } catch {}
    radioAudioMode(); // back to mixing with Spotify, for the radio's voices
  }
}

export function stopPreview(): void {
  tap++;
  wanted = null;
  release();
  if (state.key) set({ key: null, progress: 0 });
}

export async function playPreview(key: string, url: string): Promise<void> {
  const mine = ++tap;
  wanted = key;
  release();
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' }).catch(() => {});
  if (mine !== tap) return; // another song was tapped (or stop) meanwhile
  const p = createAudioPlayer(url);
  player = p;
  set({ key, progress: 0 });
  p.addListener('playbackStatusUpdate', (s) => {
    if (player !== p) return;
    if (s.didJustFinish) return stopPreview();
    if (s.duration > 0) set({ key, progress: Math.min(1, s.currentTime / s.duration) });
  });
  p.play();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** What's previewing now; the page's own previews stop when it closes. */
export function usePreview(owner: string) {
  const s = useSyncExternalStore(subscribe, () => state);
  const mine = useRef(owner);
  mine.current = owner;
  const [finding, setFinding] = useState<string | null>(null);
  const [none, setNone] = useState<ReadonlyMap<string, string>>(new Map()); // song → why there's no preview
  useEffect(
    () => () => {
      if (state.key?.startsWith(`${mine.current}:`)) stopPreview();
    },
    [],
  );
  return {
    playing: s.key,
    progress: s.progress,
    toggle: (key: string, url: string | null) => {
      const k = `${owner}:${key}`;
      if (state.key === k || wanted === k) stopPreview();
      else if (url) playPreview(k, url);
    },
    /** For lists without preview links yet (the radio's playlist): look it up on the first tap. */
    toggleFind: async (key: string, find: () => Promise<string | null>) => {
      const k = `${owner}:${key}`;
      if (state.key === k || wanted === k) return stopPreview();
      tap++; // a song that's still starting up won't start now
      wanted = k;
      release(); // the old song stops right away, not when this one has loaded
      if (state.key) set({ key: null, progress: 0 });
      setFinding(key);
      try {
        let why = 'No preview';
        const url = await find().catch((e) => {
          // say why, so "Deezer is down" and "this song has none" don't look the same
          why = /abort|network|failed to fetch/i.test(String(e)) ? "Couldn't reach Deezer" : String(e?.message ?? e).slice(0, 60);
          console.warn('Preview lookup failed', e);
          return null;
        });
        if (wanted !== k) return; // you tapped something else while it was looking
        if (url) await playPreview(k, url);
        else setNone((n) => new Map(n).set(key, why));
      } finally {
        setFinding(null);
      }
    },
    is: (key: string) => s.key === `${owner}:${key}`,
    finding: (key: string) => finding === key,
    /** Why this song has no preview (null if it has one, or wasn't tried). */
    noPreview: (key: string) => none.get(key) ?? null,
  };
}

const spotify = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;

/**
 * A list of songs: the number (or the cover), title and artist, length. Tapping plays the preview;
 * the arrow opens the full song in Spotify.
 */
export function TrackList({ tracks, owner, covers = false, artist }: { tracks: DzTrack[]; owner: string; covers?: boolean; artist?: string }) {
  const pv = usePreview(owner);
  return (
    <View style={{ gap: 2 }}>
      {tracks.map((t, i) => {
        const on = pv.is(String(t.id));
        return (
          <Pressable
            key={t.id}
            onPress={() => pv.toggle(String(t.id), t.preview)}
            style={styles.track}
            disabled={!t.preview}
            accessibilityLabel={`${on ? 'Stop' : 'Play'} the preview of ${t.title}`}
          >
            {covers && t.album?.cover ? (
              <View>
                <RemoteImage uri={t.album.cover} style={styles.trackCover} />
                {on && (
                  <View style={styles.coverPlaying}>
                    <Ionicons name="pause" size={18} color={colors.paper} />
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.num}>
                {on ? <Ionicons name="pause" size={16} color={colors.paper} /> : <Text style={styles.numText}>{i + 1}</Text>}
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.trackTitle, on && { color: '#5BE0A0' }]} numberOfLines={1}>
                {t.title}
              </Text>
              {(artist === undefined || t.artist !== artist) && !!t.artist && (
                <Text style={styles.small} numberOfLines={1}>
                  {t.artist}
                </Text>
              )}
              {on && (
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${pv.progress * 100}%` }]} />
                </View>
              )}
            </View>
            <Text style={styles.small}>{trackTime(t.seconds)}</Text>
            <Pressable onPress={() => Linking.openURL(spotify(`${t.artist} ${t.title}`))} hitSlop={10} accessibilityLabel={`Open ${t.title} in Spotify`}>
              <Ionicons name="open-outline" size={16} color={colors.muted} />
            </Pressable>
          </Pressable>
        );
      })}
      {tracks.some((t) => t.preview) && <Text style={styles.hint}>Tap a song for a 30-second preview.</Text>}
    </View>
  );
}

/** "Fans also like": round photos in a row. Tapping one finds them on Spotify (or does `onPick`). */
export function ArtistRow({ artists, onPick }: { artists: DzArtist[]; onPick?: (a: DzArtist) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
      {artists.map((a) => (
        <Pressable
          key={a.id}
          style={styles.artist}
          onPress={() => (onPick ? onPick(a) : Linking.openURL(spotify(a.name)))}
          accessibilityLabel={a.name}
        >
          {a.picture ? <RemoteImage uri={a.picture} style={styles.face} /> : <View style={[styles.face, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />}
          <Text style={styles.artistName} numberOfLines={1}>
            {a.name}
          </Text>
          {a.fans > 0 && <Text style={styles.small}>{fansText(a.fans)} fans</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** A row of releases (cover, title, year · kind). Tapping one finds it on Spotify. */
export function ReleaseRow({ releases, artist }: { releases: DzRelease[]; artist: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
      {releases.map((o) => (
        <Pressable key={o.id} style={styles.release} onPress={() => Linking.openURL(spotify(`${artist} ${o.title}`))} accessibilityLabel={o.title}>
          <RemoteImage uri={o.cover} style={styles.releaseCover} />
          <Text style={styles.artistName} numberOfLines={2}>
            {o.title}
          </Text>
          <Text style={styles.small}>
            {o.date?.slice(0, 4) ?? '—'} · {o.kind}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const FACE = 76;
const RELEASE = 132;

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  num: { width: 24, alignItems: 'center' },
  numText: { color: colors.muted, fontFamily: mono, fontSize: 13 },
  trackCover: { width: 44, height: 44, borderRadius: 6 },
  coverPlaying: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  trackTitle: { color: colors.paper, fontFamily: fonts.sansRegular, fontSize: 15 },
  small: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
  hint: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 11, marginTop: 6 },
  bar: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 4, overflow: 'hidden' },
  barFill: { height: 2, backgroundColor: '#5BE0A0' },
  artist: { width: FACE + 8, alignItems: 'center', gap: 4 },
  face: { width: FACE, height: FACE, borderRadius: FACE / 2 },
  artistName: { color: colors.paper, fontFamily: fonts.sansRegular, fontSize: 13, textAlign: 'center' },
  release: { width: RELEASE, gap: 4 },
  releaseCover: { width: RELEASE, height: RELEASE, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)' },
});
