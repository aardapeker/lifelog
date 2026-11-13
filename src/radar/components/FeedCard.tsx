// Ported from the radar repo (mobile/src/components): keep the two in step.
import Ionicons from '../../components/Icon'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

import type { FeedItem } from '../types'
import { formatDuration, isUsefulSnippet } from '../format'
import { colors, mono, ui, fonts } from '../theme'
import { CardMeta } from './CardMeta'
import { PostBody } from './PostBody'

/** Types whose `author` line is worth showing (channel, paper authors, HN user...). */
const SHOWS_AUTHOR = new Set(['VIDEO', 'SHORT', 'PAPER', 'PODCAST', 'DISCUSSION'])

/** One card for every type; the type decides the media and the extras. Opened items are dimmed. */
export function FeedCard({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const isVideo = item.type === 'VIDEO' || item.type === 'SHORT'
  const sideImage = (item.type === 'ARTICLE' || item.type === 'DISCUSSION') && item.thumbnailUrl

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [ui.card, item.read && styles.read, pressed && styles.pressed]}
    >
      {item.type === 'POST' ? (
        <View style={styles.body}>
          <PostBody item={item} />
        </View>
      ) : (
        <>
          {isVideo && <VideoThumb item={item} />}
          <View style={[styles.body, styles.row]}>
            <View style={styles.text}>
              <CardMeta item={item} />
              <Text style={styles.title}>{item.title}</Text>
              {isUsefulSnippet(item.snippet, item.title) && (
                <Text style={styles.snippet} numberOfLines={3}>{item.snippet}</Text>
              )}
              <Extras item={item} />
            </View>
            {sideImage && <Image source={{ uri: item.thumbnailUrl ?? undefined }} style={styles.side} resizeMode="cover" />}
          </View>
        </>
      )}
    </Pressable>
  )
}

export function VideoThumb({ item }: { item: FeedItem }) {
  return (
    <View style={styles.video}>
      {item.thumbnailUrl && <Image source={{ uri: item.thumbnailUrl ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={styles.play}>
        <Ionicons name="play" size={26} color={colors.paper} />
      </View>
      {item.durationSeconds != null && (
        <Text style={styles.duration}>{formatDuration(item.durationSeconds, true)}</Text>
      )}
    </View>
  )
}

function Extras({ item }: { item: FeedItem }) {
  const parts: string[] = []
  if (SHOWS_AUTHOR.has(item.type) && item.author) parts.push(item.author)
  if (item.type === 'PODCAST' && item.durationSeconds) parts.push(`🎧 ${formatDuration(item.durationSeconds)}`)
  if (item.type === 'DISCUSSION' && item.score != null) parts.push(`▲ ${item.score} · ${item.commentCount ?? 0} comments`)
  if (parts.length === 0) return null
  return <Text style={styles.extras}>{parts.join(' · ')}</Text>
}

const styles = StyleSheet.create({
  read: { opacity: 0.6 },
  pressed: { borderColor: colors.muted },
  body: { padding: 16 },
  row: { flexDirection: 'row', gap: 12 },
  text: { flex: 1, gap: 6 },
  title: { color: colors.paper, fontSize: 18, fontFamily: fonts.sansBold, lineHeight: 24 },
  snippet: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20 },
  extras: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  side: { width: 96, height: 72, borderRadius: 10 },
  video: { aspectRatio: 16 / 9, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(18,16,14,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(18,16,14,0.85)',
    color: colors.paper,
    fontFamily: mono,
    fontSize: 12,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
})
