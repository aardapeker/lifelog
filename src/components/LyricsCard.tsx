import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lyricsOf, type Lrc } from '../lib/songFacts';
import { lineAt, parseLrc, type LyricLine } from '../lib/songText';
import type { Track } from '../lib/spotify';
import { colors, fonts } from '../lib/theme';
import { Glass } from './Glass';
import Ionicons from './Icon';

/*
 * Live lyrics under the player, like Spotify's: the line being sung glows, the next ones wait below,
 * and tapping a line jumps the song there. Open it to see the whole song. From LRCLIB (free, open),
 * the same lookup the show uses for the intros and endings; songs without timed lyrics show plain
 * text, or say there are none.
 */

/**
 * Where the song is now, in ms, smooth between Spotify's progress updates (they come every few
 * seconds): counts on from the last update while the music plays.
 */
function usePlayhead(progress: number, durationMs: number, running: boolean): number {
  const base = useRef({ ms: progress * durationMs, at: Date.now() });
  const [, redraw] = useState(0);
  useEffect(() => {
    base.current = { ms: progress * durationMs, at: Date.now() };
    redraw((n) => n + 1);
  }, [progress, durationMs]);
  useEffect(() => {
    if (!running) return;
    base.current = { ...base.current, at: Date.now() }; // resumed: count from now, not from the pause
    const t = setInterval(() => redraw((n) => n + 1), 250);
    return () => {
      clearInterval(t);
      // paused: remember how far it got
      base.current = { ms: base.current.ms + (Date.now() - base.current.at), at: Date.now() };
    };
  }, [running]);
  return Math.min(durationMs, base.current.ms + (running ? Date.now() - base.current.at : 0));
}

export function LyricsCard({
  track,
  progress,
  running,
  onSeek,
}: {
  track: Track;
  progress: number;
  running: boolean; // the song is playing (not paused, no talk before it)
  onSeek: (frac: number) => void;
}) {
  const [lrc, setLrc] = useState<Lrc | null | undefined>(undefined); // undefined: still looking
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    setLrc(undefined);
    setOpen(false);
    lyricsOf(track)
      .then((l) => live && setLrc(l))
      .catch(() => live && setLrc(null));
    return () => {
      live = false;
    };
  }, [track.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines: LyricLine[] = parseLrc(lrc?.syncedLyrics);
  const now = usePlayhead(progress, track.durationMs, running);
  const at = lineAt(lines, now + 300); // a hair early, like karaoke: you see the line as it starts

  if (lrc === undefined) return null; // looking: nothing yet (no flicker of "no lyrics")
  const plain = !lines.length ? lrc?.plainLyrics?.trim() : null;
  if (!lines.length && !plain && !lrc?.instrumental) return null; // nothing to show: no empty card

  // folded: the line before, the one being sung, and the next three
  const from = open ? 0 : Math.max(0, at - 1);
  const shown = open ? lines : lines.slice(from, from + 5);

  return (
    <Glass radius={22} style={styles.card} fill="rgba(20, 19, 19, 0.38)">
      <Pressable onPress={() => setOpen(!open)} style={styles.head} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.label}>LYRICS</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {lrc?.instrumental ? (
        <Text style={styles.muted}>♪ Instrumental</Text>
      ) : lines.length ? (
        <View style={{ gap: 10 }}>
          {at < 0 && !open && <Text style={styles.waiting}>♪</Text>}
          {shown.map((l, k) => {
            const i = from + k;
            const state = i === at ? 'now' : i < at ? 'past' : 'next';
            return (
              <Text
                key={`${l.ms}-${i}`}
                style={[styles.line, state === 'now' && styles.now, state === 'past' && styles.past]}
                onPress={() => onSeek(l.ms / Math.max(1, track.durationMs))}
                suppressHighlighting
              >
                {l.text}
              </Text>
            );
          })}
          {!open && <Text style={styles.hint}>Tap a line to jump there · open for the whole song</Text>}
        </View>
      ) : (
        <Text style={styles.plain} numberOfLines={open ? undefined : 6}>
          {plain}
        </Text>
      )}
      <Text style={styles.credit}>LRCLIB</Text>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, marginTop: 18, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  line: { fontFamily: fonts.sansBold, fontSize: 19, lineHeight: 26, color: 'rgba(255,255,255,0.38)' },
  now: { color: colors.text, fontSize: 23, lineHeight: 30 },
  past: { color: 'rgba(255,255,255,0.22)' },
  waiting: { fontFamily: fonts.sansBold, fontSize: 23, color: colors.text },
  plain: { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.muted },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  credit: { fontFamily: fonts.sansRegular, fontSize: 11, color: colors.muted },
});
