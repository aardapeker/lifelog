// Ported from the radar repo (mobile/src/components): keep the two in step.
import { Image, StyleSheet, Text, View } from 'react-native'

import type { FeedItem } from '../types'
import { splitAuthor, timeAgo } from '../format'
import { colors, mono } from '../theme'
import { metaStyles } from './CardMeta'

/** A Mastodon post: author row, text, image, likes. Card and detail screen (`large`). */
export function PostBody({ item, large = false }: { item: FeedItem; large?: boolean }) {
  const [name, handle] = splitAuthor(item.author)
  const size = large ? 48 : 40
  return (
    <View style={styles.wrap}>
      <View style={styles.author}>
        {item.authorAvatarUrl ? (
          <Image source={{ uri: item.authorAvatarUrl ?? undefined }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <View style={[styles.initial, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={styles.initialText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.muted} numberOfLines={1}>{handle} · {timeAgo(item.publishedAt)}</Text>
        </View>
        <View style={[metaStyles.dot, { backgroundColor: item.topicColor }]} />
        <Text style={styles.muted}>{item.topicName}</Text>
      </View>
      {item.snippet && <Text style={[styles.text, large && styles.large]}>{item.snippet}</Text>}
      {item.thumbnailUrl && (
        <Image source={{ uri: item.thumbnailUrl ?? undefined }} style={[styles.image, !large && { maxHeight: 280 }]} resizeMode="cover" />
      )}
      <Text style={styles.stats}>
        ♥ {item.score ?? 0}   ↩ {item.commentCount ?? 0}   {item.sourceName}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  initial: { backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: colors.paper, fontWeight: '700' },
  name: { color: colors.paper, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  text: { color: colors.paper, fontSize: 15, lineHeight: 22 },
  large: { fontSize: 18, lineHeight: 27 },
  image: { width: '100%', aspectRatio: 16 / 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  stats: { color: colors.muted, fontFamily: mono, fontSize: 12 },
})
