import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { articleStyles as styles, paragraphs, SearchedFor, SourceList } from '../../components/Article';
import { FadeIn } from '../../components/motion';
import { IconButton, InfoTile, PillButton } from '../../components/ui';
import { deleteResearch, getResearch, researchSources, type Research } from '../../lib/autonomy';
import { formatDate } from '../../lib/notes';

/** One thing the friend looked up on its own, laid out like a short blog post. */
export default function ResearchScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [r, setR] = useState<Research | null>(null);

  useEffect(() => {
    getResearch(db, Number(id)).then(setR);
  }, [db, id]);

  const remove = () =>
    Alert.alert('Remove this?', r?.topic, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (r) await deleteResearch(db, r.id);
          router.back();
        },
      },
    ]);

  const talk = () =>
    router.navigate({ pathname: '/chat', params: { new: '1', ask: `About what you looked up, "${r?.topic}": ` } });

  const sources = r ? researchSources(r) : [];
  const body = r?.result ? paragraphs(r.result) : [];
  const words = r?.result?.split(/\s+/).length ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>Looked into</Text>
        <IconButton icon="trash-outline" label="Remove" onPress={remove} />
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {r && (
          <FadeIn>
            <Text style={styles.title}>{r.topic}</Text>
            {!!r.why && <Text style={styles.hook}>Because you wrote: “{r.why}”</Text>}

            <View style={styles.tiles}>
              <InfoTile label="Reading" value={`${Math.max(1, Math.round(words / 200))} min`} />
              <InfoTile label="Sources" value={String(sources.length)} />
              <InfoTile label="Looked up" value={formatDate(r.done_at ?? r.created_at).split(',').slice(0, 2).join(',')} />
            </View>

            {r.status === 'pending' ? (
              <Text style={styles.body}>On the list. Your friend will look it up soon.</Text>
            ) : (
              <View style={styles.section}>
                {body.map((p, i) => (
                  <Text key={i} style={styles.body} selectable>
                    {p}
                  </Text>
                ))}
              </View>
            )}

            {r.note_id !== null && (
              <Pressable onPress={() => router.push(`/entry/${r.note_id}`)} hitSlop={6}>
                <Text style={styles.small}>Open the entry it came from →</Text>
              </Pressable>
            )}

            <PillButton label="Talk about it" onPress={talk} full style={{ marginTop: 24 }} />
            <SourceList sources={sources} />
            <SearchedFor queries={r.query ? [r.query] : []} />
          </FadeIn>
        )}
      </ScrollView>
    </View>
  );
}
