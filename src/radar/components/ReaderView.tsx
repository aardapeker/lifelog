// Ported from the radar repo (mobile/src/components): keep the two in step.
import { useState } from 'react'
import { Image, ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { useReader } from '../hooks'
import type { FeedItem, ReaderBlock } from '../types'
import { colors, ui, fonts } from '../theme'
import { Retry } from './AiSummary'
import { Pill } from './Pill'

/** Articles only: "Read here, no ads". The backend sends clean blocks, never HTML. */
export function ReaderView({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false)
  const reader = useReader(item.id, open)
  if (item.type !== 'ARTICLE' && item.type !== 'DISCUSSION') return null

  if (!open) {
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <Pill label="Read here, no ads" icon="reader-outline" variant="on" onPress={() => setOpen(true)} />
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <Pill label="Hide article" icon="close" variant="on" onPress={() => setOpen(false)} />
      {reader.isPending && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={ui.muted}>Fetching the article…</Text>
        </View>
      )}
      {reader.isError && <Retry text={reader.error?.message ?? ""} onRetry={reader.refetch} />}
      {reader.data?.status === 'unavailable' && <Text style={ui.muted}>{reader.data.message}</Text>}
      {reader.data?.status === 'ok' && (
        <>
          <Text style={ui.muted}>Reader view · {reader.data.siteName ?? hostOf(reader.data.url)}</Text>
          {reader.data.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </>
      )}
    </View>
  )
}

function Block({ block }: { block: ReaderBlock }) {
  switch (block.type) {
    case 'h2':
      return <Text style={styles.h2}>{block.text}</Text>
    case 'h3':
      return <Text style={styles.h3}>{block.text}</Text>
    case 'quote':
      return <Text style={[ui.body, styles.quote]}>{block.text}</Text>
    case 'li':
      return <Text style={ui.body}>•  {block.text}</Text>
    case 'img':
      return block.src ? <Image source={{ uri: block.src ?? undefined }} style={styles.img} resizeMode="contain" /> : null
    default:
      return <Text style={ui.body}>{block.text}</Text>
  }
}

const hostOf = (url: string | null) => (url ? url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '')

const styles = StyleSheet.create({
  wrap: { gap: 14, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
  h2: { color: colors.paper, fontSize: 22, fontFamily: fonts.sansBold, marginTop: 8 },
  h3: { color: colors.paper, fontSize: 18, fontFamily: fonts.sansBold },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 12, fontFamily: fonts.serifItalic },
  img: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10 },
})
