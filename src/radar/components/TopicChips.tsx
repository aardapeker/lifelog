// Ported from the radar repo (mobile/src/components): keep the two in step.
import { ScrollView, StyleSheet, View } from 'react-native'

import type { Topic } from '../types'
import { colors } from '../theme'
import { Pill } from './Pill'

interface Props {
  topics: Topic[]
  active: string | null
  onChange: (slug: string | null) => void
  savedOnly: boolean
  onSavedOnly: (on: boolean) => void
}

/** "Saved | All · AI · Apple…" Topics are added and edited in the web app. */
export function TopicChips({ topics, active, onChange, savedOnly, onSavedOnly }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Pill
        label="Saved"
        icon={savedOnly ? 'bookmark' : 'bookmark-outline'}
        variant={savedOnly ? 'on' : 'plain'}
        onPress={() => onSavedOnly(!savedOnly)}
      />
      <View style={styles.divider} />
      {[{ slug: null as string | null, name: 'All' }, ...topics].map((t) => (
        <Pill
          key={t.slug ?? 'all'}
          label={t.name}
          variant={t.slug === active ? 'solid' : 'plain'}
          onPress={() => onChange(t.slug)}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  divider: { width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: 4 },
})
