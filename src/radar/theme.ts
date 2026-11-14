import { StyleSheet } from 'react-native';
import { colors as app, fonts, radius } from '../lib/theme';

/*
 * Radar inside Lifelog wears Lifelog's look: the same charcoal, white and grey, and Inter. The token
 * names stay the radar repo's (ink, panel, paper…) so the ported components didn't have to change;
 * only the values point at Lifelog's theme. (The standalone Radar app keeps its own ink-and-orange.)
 */
export const colors = {
  ink: app.bg,
  panel: app.surface,
  line: app.line,
  paper: app.text,
  soft: '#D9D8D8',
  muted: app.muted,
  accent: app.text, // Lifelog is monochrome: highlights are white, not orange
  up: app.ok,
} as const;

export const mono = fonts.mono;
export { fonts };

/** Styles several screens share. */
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink }, // (Radar's pages use components/Page instead: the app's background + mini player)
  card: { backgroundColor: colors.panel, borderRadius: radius.md, overflow: 'hidden' },
  label: { color: colors.muted, fontFamily: fonts.serif, fontSize: 14 }, // like Lifelog's "How long?" labels
  muted: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 14 },
  body: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24 },
});
