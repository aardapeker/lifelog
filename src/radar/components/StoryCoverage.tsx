// Ported from the radar repo (mobile/src/components): keep the two in step.
import Ionicons from '../../components/Icon'
import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useStory } from '../hooks'
import type { FeedItem } from '../types'
import { timeAgo } from '../format'
import { colors, ui, fonts } from '../theme'

/** "Coverage · 6 sources": every outlet on this story; tap one to open it in the app. */
export function StoryCoverage({ item }: { item: FeedItem }) {
  const enabled = item.storyCount > 1
  const story = useStory(item.id, enabled)
  if (!enabled) return null

  return (
    <View style={{ gap: 8 }}>
      <Text style={[ui.label, { color: colors.muted }]}>Coverage · {item.storyCount} sources</Text>
      {story.isPending && <Text style={ui.muted}>Loading sources…</Text>}
      <View style={ui.card}>
        {story.data
          ?.filter((s) => s.id !== item.id)
          .map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => router.push(`/radar/item/${s.id}`)}
              style={({ pressed }) => [styles.row, i > 0 && styles.border, pressed && { backgroundColor: colors.line }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={ui.muted}>
                  {s.sourceName ?? 'Source'} · {timeAgo(s.publishedAt)} {s.paywalled ? '🔒' : ''}
                </Text>
                <Text style={styles.title} numberOfLines={2}>{s.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  title: { color: colors.paper, fontFamily: fonts.sansRegular, fontSize: 15 },
})
