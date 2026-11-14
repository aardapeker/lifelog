import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { articleStyles, paragraphs, SearchedFor, SourceList } from '../../components/Article';
import { IconButton, InfoTile, PillButton } from '../../components/ui';
import { formatDate } from '../../lib/notes';
import { articleOf, deleteRead, getRead, markOpened, type Article, type Read } from '../../lib/reads';
import { showAlert } from '../../lib/dialog';

const styles = articleStyles;

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
    showAlert('Delete this read?', undefined, [
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

            <SourceList sources={article.sources} />
            <SearchedFor queries={article.queries} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
