// Ported from the radar repo (mobile/src/components): keep the two in step.
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { useSummary } from '../hooks'
import type { AiSummary as Summary, FeedItem } from '../types'
import { colors, ui, fonts } from '../theme'
import { Pill } from './Pill'

/** Same rules as the web app's AiSummary. */
const SUMMARIZABLE = new Set(['ARTICLE', 'DISCUSSION', 'VIDEO', 'SHORT', 'RELEASE', 'PAPER', 'PODCAST'])

const BASIS_NOTE: Record<NonNullable<Summary['basis']>, string> = {
  article: 'From the full article',
  abstract: 'From the paper abstract',
  description: 'From the description',
  headline: "From the headline only: the article couldn't be read",
}

export function AiSummary({ item }: { item: FeedItem }) {
  const enabled = SUMMARIZABLE.has(item.type)
  const summary = useSummary(item.id, enabled)
  if (!enabled || summary.data?.status === 'unsupported') return null

  return (
    <View style={[ui.card, styles.box]}>
      <Text style={ui.label}>AI TL;DR</Text>
      {summary.isPending && (
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} />
          <Text style={ui.muted}>Reading and summarizing… (only the first time)</Text>
        </View>
      )}
      {summary.isError && <Retry text={`Couldn't load the summary: ${summary.error?.message}`} onRetry={summary.refetch} />}
      {summary.data?.status === 'ok' && (
        <>
          {summary.data.bullets.map((b) => (
            <View key={b} style={styles.bullet}>
              <Text style={styles.dot}>•</Text>
              <Text style={[ui.body, { flex: 1 }]}>{b}</Text>
            </View>
          ))}
          <Text style={styles.note}>
            {summary.data.basis && BASIS_NOTE[summary.data.basis]}
            {summary.data.provider && ` · ${summary.data.provider}`}
          </Text>
        </>
      )}
      {summary.data?.status === 'disabled' && <Text style={ui.muted}>{summary.data.message}</Text>}
      {summary.data?.status === 'unavailable' && (
        <Retry text={summary.data.message ?? 'The summary failed.'} onRetry={summary.refetch} />
      )}
    </View>
  )
}

export function Retry({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={{ gap: 8, alignItems: 'flex-start' }}>
      <Text style={ui.muted}>{text}</Text>
      <Pill label="Try again" onPress={onRetry} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bullet: { flexDirection: 'row', gap: 8 },
  dot: { color: colors.accent, fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24 },
  note: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
})
