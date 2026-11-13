// Ported from the radar repo (mobile/src/components): keep the two in step.
import Ionicons from '../../components/Icon'
import { StyleSheet, Text, View } from 'react-native'

import type { FeedItem } from '../types'
import { timeAgo } from '../format'
import { colors, mono, fonts } from '../theme'

/** "● Linux · Phoronix · 3h ago  ARTICLE", shared by every card and the detail screen. */
export function CardMeta({ item, showKind = true }: { item: FeedItem; showKind?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: item.topicColor }]} />
      <Text style={styles.topic}>{item.topicName}</Text>
      {item.sourceName && <Text style={styles.muted}>· {item.sourceName}</Text>}
      {item.paywalled && <Ionicons name="lock-closed" size={12} color={colors.muted} accessibilityLabel="Usually paywalled" />}
      {item.storyCount > 1 && <Text style={styles.story}>+ {item.storyCount - 1} more</Text>}
      <Text style={styles.muted}>· {timeAgo(item.publishedAt)}</Text>
      {item.saved && <Ionicons name="bookmark" size={12} color={colors.accent} accessibilityLabel="Saved" />}
      {showKind && <Text style={styles.kind}>{item.type.toLowerCase()}</Text>}
    </View>
  )
}

export const metaStyles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  dot: metaStyles.dot,
  topic: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 13 },
  muted: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 13 },
  story: { color: colors.accent, fontFamily: fonts.sansBold, fontSize: 13 },
  kind: {
    color: colors.muted,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 5,
  },
})
