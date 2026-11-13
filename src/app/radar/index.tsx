import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedCard } from '../../radar/components/FeedCard';
import { Header, HeaderIcon } from '../../radar/components/Header';
import { TopicChips } from '../../radar/components/TopicChips';
import { timeAgo } from '../../radar/format';
import { colors, ui } from '../../radar/theme';
import type { FeedItem, Topic } from '../../radar/types';
import { useRadar } from '../../radar/useRadar';

const PAGE = 30;
const STALE = 30 * 60_000; // older than this, opening Radar fetches new news

/** Radar's feed: every topic (or one), newest first; pull down for new news. Port of the radar app's index. */
export default function RadarFeed() {
  const r = useRadar();
  const insets = useSafeAreaInsets();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(true);
  const [fetching, setFetching] = useState(false); // getting new news from the sites
  const [last, setLast] = useState(0);
  const [note, setNote] = useState('');
  const query = useRef({ topic, savedOnly });
  query.current = { topic, savedOnly };

  const load = useCallback(async () => {
    const page = await r.feed({ topic: topic ?? undefined, saved: savedOnly, limit: PAGE });
    if (query.current.topic !== topic || query.current.savedOnly !== savedOnly) return; // switched meanwhile
    setItems(page);
    setMore(page.length === PAGE);
    setLoaded(true);
  }, [r, topic, savedOnly]);

  const refresh = useCallback(async () => {
    setFetching(true);
    setNote('');
    try {
      const res = await r.refresh();
      setNote(res.saved ? `${res.saved} new` : 'Nothing new right now');
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
      setLast(await r.lastRefresh());
      await load();
    }
  }, [r, load]);

  // topics, and the feed again whenever you come back (read cards dim, saves show)
  useFocusEffect(
    useCallback(() => {
      r.topics().then(setTopics).catch(() => {});
      load().catch(() => {});
    }, [r, load]),
  );
  // the first open, or news older than half an hour: fetch on the way in
  useEffect(() => {
    r.lastRefresh().then((t) => {
      setLast(t);
      if (Date.now() - t > STALE) refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (!more || !items.length || savedOnly) return;
    const page = await r.feed({ topic: topic ?? undefined, limit: PAGE, before: items[items.length - 1].publishedAt });
    setItems((x) => [...x, ...page.filter((p) => !x.some((y) => y.id === p.id))]);
    setMore(page.length === PAGE);
  };

  const open = (item: FeedItem) => router.push(`/radar/item/${item.id}`);

  return (
    <View style={ui.screen}>
      <Header
        title="📡 Radar"
        right={
          <>
            <HeaderIcon icon="sunny-outline" label="Today" onPress={() => router.push('/radar/today')} />
            <HeaderIcon icon="options-outline" label="Topics and settings" onPress={() => router.push('/radar/settings')} />
          </>
        }
      />
      <View>
        <TopicChips topics={topics} active={topic} onChange={setTopic} savedOnly={savedOnly} onSavedOnly={setSavedOnly} />
      </View>
      <Text style={styles.status}>
        {fetching ? 'Checking the news sites…' : last ? `Updated ${timeAgo(new Date(last).toISOString())}${note ? ` · ${note}` : ''}` : note}
      </Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <FeedCard item={item} onPress={() => open(item)} />
          </View>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={fetching} onRefresh={refresh} colors={[colors.accent]} progressBackgroundColor={colors.panel} />}
        ListEmptyComponent={
          <Text style={[ui.muted, styles.empty]}>
            {!loaded || fetching
              ? 'Getting your first news… (Bing News, Hacker News, YouTube, GitHub, Mastodon)'
              : savedOnly
                ? 'Nothing saved yet. Open something and tap Save.'
                : 'Nothing here yet. Pull down to check again, or add keywords in ⚙.'}
          </Text>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  status: { color: colors.muted, fontSize: 12, paddingHorizontal: 20, paddingBottom: 6 },
  list: { paddingHorizontal: 16 },
  cell: { paddingBottom: 12 },
  empty: { padding: 24, textAlign: 'center' },
});
