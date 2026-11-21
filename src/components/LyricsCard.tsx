import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../lib/albumColors';
import { lyricsOf, type Lrc } from '../lib/songFacts';
import { lineAt, parseLrc, type LyricLine } from '../lib/songText';
import type { Track } from '../lib/spotify';
import { colors, fonts } from '../lib/theme';
import { SeekBar } from './expressive';
import Ionicons from './Icon';
import { PressScale } from './motion';

/*
 * Live lyrics, like Spotify's: a card in the cover's colour under the player, following the song
 * (the line being sung in white, the rest in the cover's tint, soft fades at the edges), and ⤢ (or
 * a tap on the card) opens them full screen with auto-scroll, the seek bar and play/pause.
 * Tap a line to jump the song there. From LRCLIB (free, open), the same lookup the show uses for
 * the intros and endings; plain text when there are no timings, no card when there's nothing.
 * Light on the phone: flat colours and a scroll when the line changes, no blur or shadows.
 */

/* ── colours from the cover ── */

const rgbOf = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? ['80', '70', '90']).slice(0, 3).map(Number);
/** a + (b − a)·t, as "rgb(…)" */
function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(', ')})`;
}
const alpha = (c: string, a: number) => `rgba(${rgbOf(c).join(', ')}, ${a})`;

/** The card's colours: a deep, saturated version of the cover (like Spotify's), and a light tint for the lines. */
function tones(p: Palette | null) {
  const glow = p?.glow ?? 'rgb(150, 110, 140)';
  const deep = p?.deep ?? 'rgb(40, 30, 40)';
  const top = mix(deep, glow, 0.25);
  const bottom = mix(deep, glow, 0.5);
  return { top, bottom, line: alpha(mix(glow, 'rgb(255, 255, 255)', 0.55), 0.9) };
}

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
      base.current = { ms: base.current.ms + (Date.now() - base.current.at), at: Date.now() }; // paused: keep how far it got
    };
  }, [running]);
  return Math.min(durationMs, base.current.ms + (running ? Date.now() - base.current.at : 0));
}

type Props = {
  track: Track;
  progress: number;
  running: boolean; // the song is playing (not paused, no talk before it)
  paused: boolean;
  palette: Palette | null;
  onSeek: (frac: number) => void;
  onTogglePause: () => void;
};

export function LyricsCard({ track, progress, running, paused, palette, onSeek, onTogglePause }: Props) {
  const [lrc, setLrc] = useState<Lrc | null | undefined>(undefined); // undefined: still looking
  const [full, setFull] = useState(false);
  useEffect(() => {
    let live = true;
    setLrc(undefined);
    lyricsOf(track)
      .then((l) => live && setLrc(l))
      .catch(() => live && setLrc(null));
    return () => {
      live = false;
    };
  }, [track.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = parseLrc(lrc?.syncedLyrics);
  const now = usePlayhead(progress, track.durationMs, running);
  const at = lineAt(lines, now + 300); // a hair early, like karaoke: you see the line as it starts
  const t = tones(palette);
  const seekTo = (l: LyricLine) => onSeek(l.ms / Math.max(1, track.durationMs));

  if (lrc === undefined) return null; // still looking: nothing yet (no flicker of "no lyrics")
  const plain = !lines.length ? lrc?.plainLyrics?.trim() : null;
  if (!lines.length && !plain && !lrc?.instrumental) return null; // nothing to show: no empty card

  return (
    <>
      <Pressable onPress={() => lines.length && setFull(true)} style={styles.card} accessibilityLabel="Open the lyrics full screen">
        <LinearGradient colors={[t.top, t.bottom]} style={StyleSheet.absoluteFill} />
        <View style={styles.head}>
          <Text style={styles.title}>Lyrics</Text>
          {lines.length > 0 && (
            <Pressable onPress={() => setFull(true)} style={styles.round} hitSlop={8} accessibilityLabel="Full screen">
              <Ionicons name="expand-outline" size={18} color={colors.text} />
            </Pressable>
          )}
        </View>
        {lrc?.instrumental ? (
          <Text style={[styles.line, { color: t.line }]}>♪ Instrumental</Text>
        ) : lines.length ? (
          <Lines lines={lines} at={at} tint={t.line} height={CARD_LINES} fade={t.bottom} fadeTop={t.top} onSeek={seekTo} />
        ) : (
          <Text style={[styles.plain, { color: t.line }]} numberOfLines={8}>
            {plain}
          </Text>
        )}
      </Pressable>

      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)} statusBarTranslucent>
        <FullLyrics
          track={track}
          lines={lines}
          at={at}
          tones={t}
          progress={progress}
          paused={paused}
          onSeek={onSeek}
          onLine={seekTo}
          onTogglePause={onTogglePause}
          onClose={() => setFull(false)}
        />
      </Modal>
    </>
  );
}

const CARD_LINES = 330; // the card's window onto the song, in px (about six lines)

/**
 * The lines in a window of `height` px that keeps the sung one about a third of the way down,
 * scrolling smoothly when it changes. Scrolling by hand pauses that for a few seconds (like Spotify).
 */
function Lines({
  lines,
  at,
  tint,
  height,
  fade,
  fadeTop,
  onSeek,
  big = false,
  scrollable = false,
}: {
  lines: LyricLine[];
  at: number;
  tint: string;
  height: number;
  fade: string;
  fadeTop: string;
  onSeek: (l: LyricLine) => void;
  big?: boolean;
  scrollable?: boolean;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const ys = useRef<number[]>([]);
  const handAt = useRef(0); // when you last scrolled yourself
  useEffect(() => {
    if (Date.now() - handAt.current < 4000) return;
    const y = ys.current[Math.max(0, at)] ?? 0;
    ref.current?.scrollTo({ y: Math.max(0, y - height * 0.3), animated: true });
  }, [at, height]);
  return (
    <View style={{ height }}>
      <ScrollView
        ref={ref}
        scrollEnabled={scrollable}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => (handAt.current = Date.now())}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: height * 0.6, gap: big ? 18 : 12 }}
      >
        {lines.map((l, i) => (
          <Text
            key={`${l.ms}-${i}`}
            onLayout={(e) => (ys.current[i] = e.nativeEvent.layout.y)}
            onPress={() => onSeek(l)}
            suppressHighlighting
            style={[big ? styles.bigLine : styles.line, { color: i === at ? colors.text : tint }, i === at && (big ? styles.bigNow : styles.now)]}
          >
            {l.text}
          </Text>
        ))}
      </ScrollView>
      {/* soft edges, in the card's own colours */}
      <LinearGradient colors={[fadeTop, alpha(fadeTop, 0)]} style={[styles.fade, { top: 0, height: 28 }]} pointerEvents="none" />
      <LinearGradient colors={[alpha(fade, 0), fade]} style={[styles.fade, { bottom: 0, height: 56 }]} pointerEvents="none" />
    </View>
  );
}

/** Full screen: the whole song, scrolling along; the seek bar and play/pause at the bottom. */
function FullLyrics({
  track,
  lines,
  at,
  tones: t,
  progress,
  paused,
  onSeek,
  onLine,
  onTogglePause,
  onClose,
}: {
  track: Track;
  lines: LyricLine[];
  at: number;
  tones: ReturnType<typeof tones>;
  progress: number;
  paused: boolean;
  onSeek: (frac: number) => void;
  onLine: (l: LyricLine) => void;
  onTogglePause: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(500);
  return (
    <View style={styles.full}>
      <LinearGradient colors={[t.top, t.bottom]} style={StyleSheet.absoluteFill} />
      <View style={[styles.fullHead, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close the lyrics">
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.fullTitle} numberOfLines={1}>
            {track.name}
          </Text>
          <Text style={styles.fullArtist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 24 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
        <Lines lines={lines} at={at} tint={t.line} height={h} fade={t.bottom} fadeTop={t.top} onSeek={onLine} big scrollable />
      </View>
      <View style={[styles.fullFoot, { paddingBottom: insets.bottom + 16 }]}>
        <SeekBar progress={progress} durationMs={track.durationMs} seed={track.id} onSeek={onSeek} />
        <PressScale onPress={onTogglePause} scaleTo={0.9} style={styles.play} accessibilityLabel={paused ? 'Play' : 'Pause'}>
          <Ionicons name={paused ? 'play' : 'pause'} size={30} color="#111" />
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 18, borderRadius: 22, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  line: { fontFamily: fonts.sansBold, fontSize: 21, lineHeight: 28 },
  now: { fontSize: 24, lineHeight: 31 },
  plain: { fontFamily: fonts.sansBold, fontSize: 18, lineHeight: 27, paddingBottom: 12 },
  fade: { position: 'absolute', left: 0, right: 0 },
  full: { flex: 1, backgroundColor: '#111' },
  fullHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  fullTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  fullArtist: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.text, opacity: 0.85 },
  bigLine: { fontFamily: fonts.sansBold, fontSize: 25, lineHeight: 33 },
  bigNow: { fontSize: 29, lineHeight: 37 },
  fullFoot: { paddingHorizontal: 24, gap: 14, alignItems: 'center' },
  play: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
