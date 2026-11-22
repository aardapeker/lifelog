import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Show } from '../lib/radio';
import { clock, plain, promptAt, speakersOf, tapeTimes, type Skin } from '../lib/skins';
import type { SpokenLine } from '../lib/tts';
import Ionicons from './Icon';

/*
 * The player's radio parts, in the station's skin (lib/skins):
 * - Booth: who's on the mic (a badge per host, the one talking lit up), the ON AIR light, and the talk as
 *   a teleprompter: what's been said, the line being said now, what's coming.
 * - ShowTape: the whole show as a cassette strip: a block per song (as long as the song), a marker for
 *   each talk. Tap a song to play it, a marker to hear that talk again.
 * Flat views and one meter animation (only while someone talks): light on the phone.
 */

/** A panel in the skin: its colour, border, corners, and neon's glow / rock's hard shadow / the CRT's lines. */
export function Panel({ skin, style, children }: { skin: Skin; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View
      style={[
        {
          backgroundColor: skin.panel,
          borderColor: skin.border,
          borderWidth: skin.hard ? 2 : 1,
          borderRadius: skin.radius,
          overflow: 'hidden',
        },
        skin.glow ? { boxShadow: `0 0 16px ${skin.glow}66` } : null,
        skin.hard ? { boxShadow: '6px 6px 0px #000000', overflow: 'visible' } : null,
        style,
      ]}
    >
      {skin.scan && <ScanLines />}
      {children}
    </View>
  );
}

/** A CRT's scan lines: one gradient with hard stops, not dozens of views. */
const SCAN_STOPS = 90;
const scan = (() => {
  const colors: string[] = [];
  const locations: number[] = [];
  for (let k = 0; k < SCAN_STOPS; k++) {
    const c = k % 2 ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0)';
    colors.push(c, c);
    locations.push(k / SCAN_STOPS, (k + 1) / SCAN_STOPS);
  }
  return { colors: colors as [string, string, ...string[]], locations: locations as [number, number, ...number[]] };
})();
function ScanLines() {
  return <LinearGradient pointerEvents="none" colors={scan.colors} locations={scan.locations} style={StyleSheet.absoluteFill} />;
}

/** Capitals for the skins that shout. English rules: the labels are English (Turkish rules made "SİDE A"). */
const titled = (skin: Skin, t: string) => (skin.titleCase === 'upper' ? t.toLocaleUpperCase('en') : t);

/** The studio's ON AIR light: lit while the hosts are on the mic, dark while the music plays. */
export function OnAirLight({ skin, lit }: { skin: Skin; lit: boolean }) {
  return (
    <View
      style={[styles.air, { borderColor: lit ? skin.air : skin.border, borderRadius: skin.radius ? 999 : 0, backgroundColor: lit ? 'rgba(0,0,0,0.35)' : 'transparent' }, lit && { boxShadow: `0 0 12px ${skin.air}` }]}
      accessibilityLabel={lit ? 'On air: the hosts are talking' : 'The mic is off'}
    >
      <View style={[styles.airDot, { backgroundColor: lit ? skin.air : skin.next }, lit && { boxShadow: `0 0 8px ${skin.air}` }]} />
      <Text style={[styles.airText, { color: lit ? skin.text : skin.said }]}>ON AIR</Text>
    </View>
  );
}

/** A voice meter, bouncing while someone talks (native-driver scale, so the JS thread stays free). */
function Meter({ skin }: { skin: Skin }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const frames = [0, 0.25, 0.5, 0.75, 1];
  return (
    <View style={styles.meter} accessible={false}>
      {[0.5, 0.9, 0.6, 1, 0.7].map((base, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: 16,
            borderRadius: skin.round ? 1.5 : 0,
            backgroundColor: skin.accent,
            transform: [{ scaleY: v.interpolate({ inputRange: frames, outputRange: frames.map((_, k) => 0.25 + base * Math.abs(Math.sin((k + i) * 1.7)) * 0.75) }) }],
          }}
        />
      ))}
    </View>
  );
}

/** How far into the talk, asked a few times a second while it plays (the clip knows; the screen doesn't). */
function useTalkFrac(speaking: boolean, talkAt: () => number | null): number | null {
  const [frac, setFrac] = useState<number | null>(null);
  useEffect(() => {
    if (!speaking) {
      setFrac(null);
      return;
    }
    const read = () => setFrac(talkAt());
    read();
    const t = setInterval(read, 350);
    return () => clearInterval(t);
  }, [speaking, talkAt]);
  return frac;
}

const LABELS: Record<string, string> = { News: 'News', Commercial: 'Commercial break', Goodbye: 'Goodbye' };

export function Booth({
  skin,
  talk,
  label,
  speaking,
  talkAt,
  showNames,
}: {
  skin: Skin;
  talk: SpokenLine[];
  label: string | null;
  speaking: boolean;
  talkAt: () => number | null;
  showNames: boolean; // more than one voice on this station: say who says each line
}) {
  const frac = useTalkFrac(speaking, talkAt);
  const now = speaking && frac !== null ? promptAt(talk, frac) : -1;
  const hosts = useMemo(() => speakersOf(talk).slice(0, 3), [talk]);
  const talking = now >= 0 ? talk[now]?.speaker : null;
  const tag = label ? LABELS[label] : null;
  return (
    <Panel skin={skin} style={styles.booth}>
      <View style={styles.boothHead}>
        <Ionicons name="mic-outline" size={18} color={skin.accent} />
        <View style={styles.hosts}>
          {hosts.map((h) => {
            const on = h === talking;
            return (
              <View
                key={h}
                style={[
                  styles.host,
                  { borderRadius: skin.radius ? 999 : 0, borderColor: on ? skin.accent : skin.border, backgroundColor: on ? skin.accent : 'transparent' },
                  on && skin.glow ? { boxShadow: `0 0 10px ${skin.accent}` } : null,
                ]}
              >
                <Text style={[styles.hostText, { color: on ? skin.onAccent : skin.said }]} numberOfLines={1}>
                  {h}
                </Text>
              </View>
            );
          })}
        </View>
        {speaking && <Meter skin={skin} />}
        <OnAirLight skin={skin} lit={speaking} />
      </View>
      {tag && <Text style={[styles.tag, { color: skin.accent, fontFamily: skin.titleFont, letterSpacing: skin.titleSpacing }]}>{titled(skin, tag)}</Text>}
      <Text style={[styles.prompt, { fontFamily: skin.promptFont, fontSize: skin.promptSize, lineHeight: Math.round(skin.promptSize * 1.5) }]}>
        {talk.map((l, i) => {
          // talking: said / being said / still to come; the talk over: all of it, readable
          const color = now < 0 ? skin.said : i < now ? skin.said : i === now ? skin.text : skin.next;
          return (
            <Text key={i} style={{ color }}>
              {showNames && <Text style={styles.who}>{l.speaker}: </Text>}
              {plain(l.text)}
              {i < talk.length - 1 ? '\n' : ''}
            </Text>
          );
        })}
      </Text>
    </Panel>
  );
}

const GAP = 3;

/** One talk on the tape, in the skin's shape. */
function Mark({ skin, lit, size = 9 }: { skin: Skin; lit: boolean; size?: number }) {
  const color = lit ? skin.air : skin.second;
  if (skin.marker === 'paw') return <Ionicons name="paw" size={size + 5} color={lit ? skin.air : skin.accent} />;
  const shape: ViewStyle =
    skin.marker === 'diamond' || skin.marker === 'square'
      ? { width: size * 0.8, height: size * 0.8, transform: [{ rotate: '45deg' }] }
      : skin.marker === 'bar' || skin.marker === 'cursor'
        ? { width: size * 0.6, height: size * 2, borderRadius: skin.marker === 'bar' ? 1 : 0 }
        : { width: size, height: size, borderRadius: size / 2 };
  return <View style={[shape, { backgroundColor: color, borderWidth: 1.5, borderColor: skin.panel }, skin.glow ? { boxShadow: `0 0 6px ${color}` } : null]} />;
}

/**
 * The show as a cassette strip. Blocks are as long as their songs; a talk sits on the line between two
 * songs (laid out by hand, so twenty songs still fit on a phone).
 */
export function ShowTape({
  skin,
  show,
  index,
  progress,
  speaking,
  onJump,
}: {
  skin: Skin;
  show: Show;
  index: number;
  progress: number;
  speaking: boolean;
  onJump?: (i: number, withTalk: boolean) => void;
}) {
  const [w, setW] = useState(0);
  const n = show.slots.length;
  const total = show.slots.reduce((a, s) => a + Math.max(1, s.track.durationMs || 0), 0);
  const usable = Math.max(0, w - GAP * Math.max(0, n - 1));
  const xs: number[] = [];
  let x = 0;
  for (const s of show.slots) {
    xs.push(x);
    x += (Math.max(1, s.track.durationMs || 0) / total) * usable + GAP;
  }
  const width = (i: number) => (Math.max(1, show.slots[i].track.durationMs || 0) / total) * usable;
  const { at, total: length } = tapeTimes(show, Math.min(index, n), index >= n ? 0 : progress);
  const head = [styles.tapeHead, { color: skin.said, fontFamily: skin.promptFont.startsWith('JetBrains') ? skin.promptFont : 'Inter_600SemiBold' }];
  return (
    <Panel skin={skin} style={styles.tape}>
      <View style={styles.tapeTop}>
        <Text style={head} numberOfLines={1}>
          {titled(skin, skin.tape)}
        </Text>
        <Text style={head}>
          {clock(at)} / {clock(length)}
        </Text>
      </View>
      <View style={styles.strip} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 &&
          show.slots.map((s, i) => {
            const bw = width(i);
            const r = skin.round ? 4 : 0;
            return (
              <Pressable
                key={`b${i}`}
                disabled={!onJump}
                onPress={() => onJump?.(i, false)}
                hitSlop={{ top: 12, bottom: 12 }}
                accessibilityLabel={`Play ${s.track.name}`}
                style={[styles.block, { left: xs[i], width: bw, borderRadius: r, backgroundColor: i < index ? skin.played : skin.todo }]}
              >
                {i === index && <View style={{ width: `${(speaking ? 0 : Math.max(0, Math.min(1, progress))) * 100}%`, height: '100%', backgroundColor: skin.accent, borderRadius: r }} />}
              </Pressable>
            );
          })}
        {w > 0 &&
          show.slots.map((s, i) =>
            s.talk.length ? (
              <Pressable
                key={`m${i}`}
                disabled={!onJump}
                onPress={() => onJump?.(i, true)}
                accessibilityLabel={`Hear the talk before ${s.track.name}`}
                style={[styles.mark, { left: xs[i] - GAP / 2 - 12 }]}
              >
                <Mark skin={skin} lit={speaking && i === index} />
              </Pressable>
            ) : null,
          )}
        {w > 0 && show.outro.length > 0 && (
          <View style={[styles.mark, { left: w - 12 }]} accessibilityLabel="The goodbye">
            <Mark skin={skin} lit={index >= n} />
          </View>
        )}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  air: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  airDot: { width: 7, height: 7, borderRadius: 4 },
  airText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 16 },
  booth: { padding: 16, marginTop: 18 },
  boothHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hosts: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  host: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, maxWidth: 140 },
  hostText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  tag: { fontSize: 12, marginTop: 12 },
  prompt: { marginTop: 12 },
  who: { fontFamily: 'Inter_700Bold' },
  tape: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, marginTop: 18 },
  tapeTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  tapeHead: { fontSize: 11, letterSpacing: 1 },
  strip: { height: 22, marginTop: 10 },
  block: { position: 'absolute', top: 1, height: 20, overflow: 'hidden' },
  mark: { position: 'absolute', top: -1, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
