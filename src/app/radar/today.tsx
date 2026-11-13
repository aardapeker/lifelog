import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../radar/components/Header';
import { timeAgo } from '../../radar/format';
import { useLoad } from '../../radar/hooks';
import { colors, ui } from '../../radar/theme';
import { useRadar } from '../../radar/useRadar';

/** ☀ Today: the same list as the morning notification. Port of the radar app's today screen. */
export default function TodayScreen() {
  const r = useRadar();
  const insets = useSafeAreaInsets();
  const digest = useLoad(() => r.digest(), [r]);
  useFocusEffect(useCallback(() => digest.refetch(), [digest.refetch])); // opened ones drop out
  const sections = digest.data?.sections ?? [];
  return (
    <View style={ui.screen}>
      <Header title="☀️ Today" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={digest.refetch} colors={[colors.accent]} progressBackgroundColor={colors.panel} />}
      >
        <Text style={ui.muted}>The best unread things from the last 24 hours, a few per topic.</Text>
        {digest.isError && <Text style={ui.muted}>{digest.error?.message}</Text>}
        {digest.isPending && !digest.data && <Text style={ui.muted}>Picking the highlights…</Text>}
        {digest.data && sections.length === 0 && <Text style={[ui.muted, styles.done]}>You're all caught up. Nothing unread from the last 24 hours. 🎉</Text>}
        {sections.map((s) => (
          <View key={s.topic} style={{ gap: 8 }}>
            <View style={styles.heading}>
              <View style={[styles.dot, { backgroundColor: s.topicColor }]} />
              <Text style={styles.topic}>{s.topicName}</Text>
            </View>
            <View style={ui.card}>
              {s.items.map((item, i) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/radar/item/${item.id}`)}
                  style={({ pressed }) => [styles.row, i > 0 && styles.border, item.read && { opacity: 0.6 }, pressed && { backgroundColor: colors.line }]}
                >
                  <Text style={ui.muted}>
                    {item.sourceName ?? item.type.toLowerCase()} · {timeAgo(item.publishedAt)}
                    {item.storyCount > 1 && <Text style={styles.story}>  {item.storyCount} sources</Text>}
                    {item.paywalled ? '  🔒' : ''}
                  </Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20 },
  done: { padding: 24, textAlign: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  topic: { color: colors.paper, fontSize: 18, fontWeight: '700' },
  row: { padding: 14, gap: 4 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  story: { color: colors.accent, fontWeight: '700' },
  title: { color: colors.paper, fontSize: 16, fontWeight: '600' },
});
