import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, InfoTile, PillButton } from '../../components/ui';
import { formatDate } from '../../lib/notes';
import { articleOf, deleteRead, getRead, markOpened, type Article, type Read } from '../../lib/reads';
import { colors, fonts, radius } from '../../lib/theme';

const open = (url: string) => Linking.openURL(url).catch(() => {});
const paragraphs = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** A Read: a short magazine-style article the friend researched and wrote after a chat. */
export default function ReadScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [read, setRead] = useState<Read | null>(null);
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    getRead(db, Number(id)).then((r) => {
      setRead(r);
      setArticle(r ? articleOf(r) : null);
      if (r) markOpened(db, r.id);
    });
  }, [db, id]);

  const remove = () =>
    Alert.alert('Delete this read?', undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (read) await deleteRead(db, read.id);
          router.back();
        },
      },
    ]);

  const talk = () =>
    router.navigate({
      pathname: '/chat',
      params: { new: '1', ask: `I read your piece on ${article?.title ?? read?.topic}. ` },
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>A read for you</Text>
        <IconButton icon="trash-outline" label="Delete read" onPress={remove} />
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {!read ? null : !article ? (
          <Text style={styles.hook}>
            {read.status === 'pending'
              ? `Still researching "${read.topic}". It'll be ready soon.`
              : `Couldn't finish this one ("${read.topic}").`}
          </Text>
        ) : (
          <>
            <Text style={styles.title}>{article.title}</Text>
            {!!article.hook && <Text style={styles.hook}>{article.hook}</Text>}

            <View style={styles.tiles}>
              <InfoTile label="Reading" value={`${article.minutes} min`} />
              <InfoTile label="Sources" value={String(article.sources.length)} />
              <InfoTile label="Written" value={formatDate(read.done_at ?? read.created_at).split(',').slice(0, 2).join(',')} />
            </View>

            {article.sections.map((s, i) => (
              <View key={i} style={styles.section}>
                <Text style={styles.heading}>{s.heading}</Text>
                {paragraphs(s.body).map((p, j) => (
                  <Text key={j} style={styles.body} selectable>
                    {p}
                  </Text>
                ))}
              </View>
            ))}

            {article.news.length > 0 && (
              <View style={styles.news}>
                <Text style={styles.boxTitle}>What's new</Text>
                {article.news.map((n, i) => (
                  <View key={i} style={styles.newsRow}>
                    <View style={styles.dot} />
                    <Text style={styles.newsText}>{n}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!article.forYou && (
              <View style={styles.forYou}>
                <Text style={styles.forYouTitle}>Why this matters to you</Text>
                <Text style={styles.forYouText}>{article.forYou}</Text>
              </View>
            )}

            <PillButton label="Talk about it" onPress={talk} full style={{ marginTop: 28 }} />

            {article.sources.length > 0 && (
              <View style={styles.sources}>
                <Text style={styles.boxTitle}>Sources</Text>
                {article.sources.map((s, i) => (
                  <Pressable key={s.uri} style={styles.source} onPress={() => open(s.uri)}>
                    <Text style={styles.sourceNum}>{i + 1}</Text>
                    <Text style={styles.sourceText} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Ionicons name="open-outline" size={14} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}

            {article.queries.length > 0 && (
              <View style={styles.queries}>
                <Text style={styles.small}>Searched on Google</Text>
                <View style={styles.queryRow}>
                  {article.queries.map((q) => (
                    <Pressable
                      key={q}
                      style={styles.query}
                      onPress={() => open(`https://www.google.com/search?q=${encodeURIComponent(q)}`)}
                    >
                      <Ionicons name="search" size={12} color={colors.muted} />
                      <Text style={styles.queryText}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.small}>Written by AI from these sources. Check them for anything important.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { paddingHorizontal: 24, paddingTop: 28 },

  title: { fontFamily: fonts.serif, fontSize: 38, lineHeight: 44, color: colors.text, letterSpacing: -0.5 },
  hook: { fontFamily: fonts.serifItalic, fontSize: 19, lineHeight: 29, color: colors.muted, marginTop: 14 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22, marginBottom: 10 },

  section: { marginTop: 26 },
  heading: { fontFamily: fonts.serif, fontSize: 23, lineHeight: 30, color: colors.text, marginBottom: 10 },
  body: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 29, color: '#E8E6E3', marginBottom: 14 },

  news: { marginTop: 18, backgroundColor: colors.raised, borderRadius: radius.md, padding: 18, gap: 10 },
  boxTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.text, marginBottom: 4 },
  newsRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text, marginTop: 9 },
  newsText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 23, color: colors.text },

  forYou: { marginTop: 18, backgroundColor: colors.accent, borderRadius: radius.md, padding: 20 },
  forYouTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.accentText, marginBottom: 8 },
  forYouText: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 26, color: colors.accentText },

  sources: { marginTop: 32 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sourceNum: { width: 18, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  sourceText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, color: colors.text },

  queries: { marginTop: 22, gap: 8 },
  queryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  query: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  queryText: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.text },
  small: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.muted },
});
