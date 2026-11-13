import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FeedItem } from '../radar/types';
import { useRadar } from '../radar/useRadar';
import { colors, fonts, radius } from '../lib/theme';
import { PressScale } from './motion';
import { SectionTitle } from './ui';

/** Life tab: the way into Radar, with the newest few headlines from your topics. */
export function RadarCard() {
  const r = useRadar();
  const [items, setItems] = useState<FeedItem[]>([]);
  useFocusEffect(
    useCallback(() => {
      r.feed({ limit: 3 }).then(setItems).catch(() => {});
    }, [r]),
  );
  return (
    <View>
      <SectionTitle title="Radar" />
      <Text style={styles.hint}>Your topics, not people: Linux, Fedora, Claude… from news sites, Hacker News, YouTube, GitHub and Mastodon.</Text>
      <PressScale scaleTo={0.97} onPress={() => router.push('/radar')} style={styles.card} accessibilityLabel="Open Radar">
        <View style={styles.top}>
          <Text style={styles.title}>📡 Radar</Text>
          <Text style={styles.go}>›</Text>
        </View>
        {items.length ? (
          items.map((i) => (
            <View key={i.id} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: i.topicColor }]} />
              <Text style={[styles.headline, i.read && { opacity: 0.55 }]} numberOfLines={1}>
                {i.title}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.sub}>Tap to tune in. The first news takes a few seconds.</Text>
        )}
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 10 },
  // Radar's own colours (ink and orange), so it reads as its own little app
  card: { borderRadius: radius.md, padding: 18, gap: 10, backgroundColor: '#1c1916', borderWidth: 1, borderColor: 'rgba(255,122,69,0.4)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: '#f3eee6' },
  go: { fontFamily: fonts.sans, fontSize: 26, color: '#ff7a45' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headline: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, color: '#d8d0c4' },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, color: '#a39a8e' },
});
