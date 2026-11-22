import type { Show } from './radio';
import type { SpokenLine } from './tts';

/*
 * Each station's look on the player (Arda's pick from the redesign canvas, Nov 2026): the booth where
 * the hosts talk, the ON AIR light, the show's cassette strip and the song's progress line all take the
 * station's colours, letters and shapes. The cover cloud and the song's colours stay underneath, so it's
 * still one theme per song, dressed by the station. Pure data and maths (no React Native), so it's tested.
 */

/** The little shape that marks a talk on the tape (and the progress line's thumb). */
export type Marker = 'dot' | 'diamond' | 'bar' | 'square' | 'paw' | 'cursor';

export type Skin = {
  /** the ON AIR light, the playhead, the host who's talking */
  accent: string;
  /** text on the accent colour */
  onAccent: string;
  /** the ON AIR light, lit while the hosts are on the mic */
  air: string;
  /** a second colour: talk markers, the thumb (neon's cyan, rock's red) */
  second: string;
  /** the booth's and the tape's background, their border */
  panel: string;
  border: string;
  /** teleprompter: what's being said, what's been said (and the whole talk once it's over), what's next */
  text: string;
  said: string;
  next: string;
  /** the station's name in the booth and on the tape */
  titleFont: string;
  titleCase: 'upper' | 'none';
  titleSpacing: number;
  /** the teleprompter's letters */
  promptFont: string;
  promptSize: number;
  radius: number;
  /** neon: things glow (a coloured shadow) */
  glow?: string;
  /** rock: a hard black offset shadow, like a sticker on a flight case */
  hard?: boolean;
  /** night shift: a CRT's scan lines over the panels */
  scan?: boolean;
  /** something behind the whole player (Neon FM: the synthwave sun over a grid floor) */
  backdrop?: 'sunset';
  marker: Marker;
  /** the tape's song blocks: played, still to come */
  played: string;
  todo: string;
  /** the progress line's height and whether its ends are round */
  lineHeight: number;
  round: boolean;
  /** the tape's name */
  tape: string;
};

const FRIEND: Skin = {
  accent: '#F2A65A',
  air: '#FF6B4A',
  onAccent: '#2B1408',
  second: '#FFD9A8',
  panel: 'rgba(28, 18, 14, 0.62)',
  border: 'rgba(242, 166, 90, 0.35)',
  text: '#FFF4E8',
  said: 'rgba(255, 244, 232, 0.72)',
  next: 'rgba(255, 244, 232, 0.5)',
  titleFont: 'Inter_800ExtraBold_Italic',
  titleCase: 'none',
  titleSpacing: -0.3,
  promptFont: 'Inter_400Regular',
  promptSize: 16,
  radius: 22,
  marker: 'dot',
  played: 'rgba(242, 166, 90, 0.75)',
  todo: 'rgba(255, 244, 232, 0.2)',
  lineHeight: 4,
  round: true,
  tape: "Today's show",
};

export const SKINS: Record<string, Skin> = {
  friend: FRIEND,
  arabesk: {
    accent: '#E9C46A',
    air: '#FF4D4D',
    onAccent: '#2A0508',
    second: '#FF6B6B',
    panel: 'rgba(24, 4, 7, 0.72)',
    border: 'rgba(201, 162, 74, 0.55)',
    text: '#FFF6E0',
    said: 'rgba(251, 239, 217, 0.72)',
    next: 'rgba(251, 239, 217, 0.5)',
    titleFont: 'Cinzel_800ExtraBold',
    titleCase: 'upper',
    titleSpacing: 1.6,
    promptFont: 'Inter_400Regular',
    promptSize: 16,
    radius: 18,
    marker: 'diamond',
    played: 'rgba(233, 196, 106, 0.7)',
    todo: 'rgba(233, 196, 106, 0.24)',
    lineHeight: 2,
    round: true,
    tape: "Tonight's tape · side A",
  },
  neon: {
    accent: '#FF2FD0',
    air: '#33F0FF',
    onAccent: '#0B0420',
    second: '#33F0FF',
    panel: 'rgba(11, 4, 32, 0.82)',
    border: '#FF2FD0',
    text: '#FFFFFF',
    said: 'rgba(217, 205, 255, 0.78)',
    next: 'rgba(185, 166, 255, 0.72)',
    titleFont: 'Monoton_400Regular',
    titleCase: 'upper',
    titleSpacing: 1,
    promptFont: 'JetBrainsMono_500Medium',
    promptSize: 14,
    radius: 10,
    glow: '#FF2FD0',
    backdrop: 'sunset',
    marker: 'bar',
    played: '#7B5CFF',
    todo: 'rgba(123, 92, 255, 0.32)',
    lineHeight: 4,
    round: true,
    tape: 'Tape · side A · C60',
  },
  nightshift: {
    accent: '#39FF88',
    air: '#39FF88',
    onAccent: '#021208',
    second: '#B8FFD4',
    panel: 'rgba(2, 16, 8, 0.86)',
    border: 'rgba(57, 255, 136, 0.45)',
    text: '#B8FFD4',
    said: 'rgba(122, 230, 165, 0.8)',
    next: 'rgba(122, 230, 165, 0.64)',
    titleFont: 'JetBrainsMono_700Bold',
    titleCase: 'upper',
    titleSpacing: 2,
    promptFont: 'JetBrainsMono_500Medium',
    promptSize: 14,
    radius: 6,
    glow: '#39FF88',
    scan: true,
    marker: 'cursor',
    played: 'rgba(57, 255, 136, 0.7)',
    todo: 'rgba(57, 255, 136, 0.18)',
    lineHeight: 6,
    round: false,
    tape: '> shift_log',
  },
  rock: {
    accent: '#F2C230',
    air: '#D7261E',
    onAccent: '#111111',
    second: '#D7261E',
    panel: '#2A2825',
    border: '#EFE9DF',
    text: '#EFE9DF',
    said: '#BDB5A6',
    next: '#9A9486',
    titleFont: 'BlackOpsOne_400Regular',
    titleCase: 'upper',
    titleSpacing: 0.5,
    promptFont: 'Inter_600SemiBold',
    promptSize: 15,
    radius: 0,
    hard: true,
    marker: 'square',
    played: '#BDB5A6',
    todo: '#3A3732',
    lineHeight: 6,
    round: false,
    tape: 'Set list',
  },
  chill: {
    accent: '#C96A4A',
    air: '#D9573B',
    onAccent: '#FFFAF2',
    second: '#3B2F2A',
    panel: '#FFFAF2',
    border: '#E3D6C4',
    text: '#3B2F2A',
    said: '#6E5D52',
    next: '#7E6B5E',
    titleFont: 'Fraunces_800ExtraBold',
    titleCase: 'none',
    titleSpacing: 0,
    promptFont: 'Fraunces_600SemiBold',
    promptSize: 16,
    radius: 20,
    marker: 'paw',
    played: '#D9B99A',
    todo: '#EFE3D2',
    lineHeight: 6,
    round: true,
    tape: "Today's show",
  },
};

export const skinOf = (stationKey: string | undefined): Skin => SKINS[stationKey ?? ''] ?? FRIEND;

/**
 * The teleprompter: which line is being said, `frac` (0…1) into the talk's one voice clip. The lines
 * share the clip by their length (people say longer lines for longer), so it follows the voice closely
 * enough without timings from the voice service.
 */
export function promptAt(lines: SpokenLine[], frac: number): number {
  if (!lines.length) return -1;
  const sizes = lines.map((l) => Math.max(1, plain(l.text).length));
  const total = sizes.reduce((a, b) => a + b, 0);
  let left = Math.max(0, Math.min(1, frac)) * total;
  for (let i = 0; i < sizes.length; i++) {
    if (left < sizes[i]) return i;
    left -= sizes[i];
  }
  return lines.length - 1;
}

/** A talk line without the voice service's tags ("<laugh>"). */
export const plain = (text: string) => text.replace(/<[^>]+>/g, '').trim();

/** The people on the mic in this talk, in the order they first speak. */
export const speakersOf = (lines: SpokenLine[]): string[] => [...new Set(lines.map((l) => l.speaker).filter(Boolean))];

/** The tape's clock: how far into the show (the songs before this one, plus this one's progress) and how long it is. */
export function tapeTimes(show: Pick<Show, 'slots'>, index: number, progress: number): { at: number; total: number } {
  const total = show.slots.reduce((a, s) => a + (s.track.durationMs || 0), 0);
  const before = show.slots.slice(0, Math.max(0, index)).reduce((a, s) => a + (s.track.durationMs || 0), 0);
  const cur = show.slots[index]?.track.durationMs ?? 0;
  return { at: Math.min(total, before + Math.max(0, Math.min(1, progress)) * cur), total };
}

/** 0:00, or 1:02:03 past an hour. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
