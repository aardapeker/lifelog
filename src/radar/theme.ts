// Radar's own look (copied from the radar repo, mobile/src/theme.ts): it stays its own app inside Lifelog.
import { StyleSheet } from 'react-native'

/** Same tokens as the web app (frontend/src/index.css). */
export const colors = {
  ink: '#12100e',
  panel: '#1c1916',
  line: '#2e2a25',
  paper: '#f3eee6',
  soft: '#d8d0c4',
  muted: '#a39a8e',
  accent: '#ff7a45',
  up: '#7fd49a',
} as const

export const mono = 'monospace'

/** Styles several screens share. */
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  label: { color: colors.accent, fontFamily: mono, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  muted: { color: colors.muted, fontSize: 14 },
  body: { color: colors.soft, fontSize: 16, lineHeight: 24 },
})
