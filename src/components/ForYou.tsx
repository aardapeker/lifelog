import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteResearch, listResearch, researchSources, type Research } from '../lib/autonomy';
import { formatDate } from '../lib/notes';
import { articleOf, listReads, type Read } from '../lib/reads';
import { colors, fonts, radius } from '../lib/theme';
import { FadeIn, stagger } from './motion';
import { UNREAD } from './TopBar';
import { SectionTitle } from './ui';

/** Friend → For you: what your friend made for you on its own. Reads (articles) and things it looked up. */
export function ForYou() {
  const db = useSQLiteContext();
  const [research, setResearch] = useState<Research[]>([]);
  const [reads, setReads] = useState<Read[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    setResearch(await listResearch(db));
    setReads(await listReads(db));
    setLoaded(true);
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loaded && !reads.length && !research.length) {
    return (
      <Text style={styles.hint}>
        Nothing yet. When you write about something you want, wonder about or plan, your friend quietly looks it up, and
        after good chats it writes you short Reads. They'll show up here.
      </Text>
    );
  }

  return (
    <View style={{ gap: 30 }}>
      {/* ── reads ── */}
      {reads.length > 0 && (
        <FadeIn style={styles.section} delay={stagger(1, 60)}>
          <SectionTitle title="Reads" />
          <Text style={styles.hint}>Short articles your friend researched and wrote after your chats.</Text>
          <View style={{ gap: 10 }}>
            {reads.map((r) => {
              const a = articleOf(r);
              return (
                <Pressable
                  key={r.id}
                  style={({ pressed }) => [styles.readCard, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/read/${r.id}`)}
                >
                  <View style={styles.readTop}>
                    <Text style={styles.readMeta}>
                      {a ? `${a.minutes} min read, ${formatDate(r.done_at ?? r.created_at).split(',').slice(0, 2).join(',')}` : 'Researching…'}
                    </Text>
                    {!!a && !r.opened && <View style={styles.newDot} />}
                  </View>
                  <Text style={styles.readTitle}>{a?.title ?? r.topic}</Text>
                  {!!a?.hook && (
                    <Text style={styles.readHook} numberOfLines={2}>
                      {a.hook}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </FadeIn>
      )}

      {/* ── research ── */}
      {research.length > 0 && (
        <FadeIn style={styles.section} delay={stagger(2, 60)}>
          <SectionTitle title="Looked Into" />
          <Text style={styles.hint}>Things your friend searched for after reading your entries. Tap to read, hold to remove.</Text>
          <View style={styles.panel}>
            {research.map((r) => (
              <Pressable
                key={r.id}
                style={styles.research}
                onPress={() => router.push(`/research/${r.id}`)}
                onLongPress={() =>
                  Alert.alert('Remove this?', r.topic, [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: async () => {
                        await deleteResearch(db, r.id);
                        load();
                      },
                    },
                  ])
                }
              >
                <Text style={styles.rowTitle}>{r.topic}</Text>
                {r.status === 'pending' ? (
                  <Text style={styles.rowMeta}>On the list, looking it up soon.</Text>
                ) : (
                  <>
                    <Text style={styles.researchText} numberOfLines={3}>
                      {r.result}
                    </Text>
                    <Text style={styles.researchLink}>
                      Read · {researchSources(r).length} source{researchSources(r).length === 1 ? '' : 's'} →
                    </Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>
        </FadeIn>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 6 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 17, color: colors.text },
  rowMeta: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2 },
  readCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18 },
  readTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readMeta: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  newDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: UNREAD },
  readTitle: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 22, lineHeight: 28, color: colors.text, marginTop: 6 },
  readHook: { fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 6 },
  research: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 },
  researchText: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: colors.text, marginTop: 2 },
  researchLink: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },
});
