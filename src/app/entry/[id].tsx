import Ionicons from '../../components/Icon';
import { openWrite } from '../../lib/write';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { articleStyles, inline } from '../../components/Article';
import { blocksOf, toggleTodo, type Block } from '../../lib/markdown';
import { FadeIn, PressScale } from '../../components/motion';
import { PhotoViewer } from '../../components/PhotoViewer';
import { IconButton, InfoTile } from '../../components/ui';
import { entryTitle, formatDate, formatTime, getNote, setNoteBody, type Note } from '../../lib/notes';
import { listPhotos, photoUri, type Photo } from '../../lib/photos';
import { colors, fonts, radius } from '../../lib/theme';
import { useFirstFrame } from '../../lib/perf';
import { ShowWash } from '../../components/radioParts';

/** One block of the entry: a heading, a list (to-dos tick with a tap), a quote, a divider, or a paragraph. */
function BlockView({ block, onTick }: { block: Block; onTick: (line: number) => void }) {
  if (block.type === 'heading')
    return <Text style={[articleStyles.heading, block.level > 1 && { fontSize: block.level === 2 ? 20 : 18, lineHeight: 27 }]}>{inline(block.text)}</Text>;
  if (block.type === 'divider') return <View style={styles.divider} />;
  if (block.type === 'quote')
    return (
      <View style={styles.quote}>
        <Text style={[articleStyles.body, { fontFamily: fonts.serifItalic }]}>{inline(block.text)}</Text>
      </View>
    );
  if (block.type === 'list') {
    let n = 0;
    return (
      <View style={styles.list}>
        {block.items.map((item) => {
          const todo = item.kind === 'todo' || item.kind === 'done';
          const done = item.kind === 'done';
          n = item.kind === 'number' ? n + 1 : 0;
          return (
            <View key={item.line} style={styles.item}>
              {todo ? (
                <Pressable onPress={() => onTick(item.line)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
                  <Ionicons name={done ? 'checkbox' : 'square-outline'} size={21} color={done ? colors.muted : colors.text} style={styles.box} />
                </Pressable>
              ) : (
                <Text style={styles.bullet}>{item.kind === 'number' ? `${n}.` : '•'}</Text>
              )}
              <Text style={[articleStyles.body, { flex: 1, marginBottom: 4 }, done && styles.done]} selectable>
                {inline(item.text)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }
  return (
    <Text style={articleStyles.body} selectable>
      {inline(block.text)}
    </Text>
  );
}

/** An entry to read, laid out like a blog post: headline, the song, the words, the photos full width. Edit is one tap away. */
export default function EntryScreen() {
  useFirstFrame('Entry'); // Settings → Privacy → Speed
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);

  // back from the editor: show the new version (or leave if it was deleted)
  useFocusEffect(
    useCallback(() => {
      getNote(db, Number(id)).then((n) => (n ? setNote(n) : router.back()));
      listPhotos(db, Number(id)).then(setPhotos).catch(() => setPhotos([]));
    }, [db, id]),
  );

  const edit = () => openWrite({ id: Number(id) });
  const blocks = note ? blocksOf(note.body) : [];
  // ticking a to-do changes only that mark: no "edited" date, no re-reading by the AI
  const tick = async (line: number) => {
    if (!note) return;
    const body = toggleTodo(note.body, line);
    setNote({ ...note, body });
    await setNoteBody(db, note.id, body);
  };
  const words = note?.body.split(/\s+/).filter(Boolean).length ?? 0;
  const [first, ...rest] = photos;

  return (
    <View style={[articleStyles.screen, { paddingTop: insets.top + 8 }]}>
      <ShowWash />
      <View style={articleStyles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={articleStyles.barTitle}>{note ? formatDate(note.created_at).split(',').slice(0, 2).join(',') : ''}</Text>
        <IconButton icon="create-outline" label="Edit this entry" onPress={edit} />
      </View>

      <ScrollView style={articleStyles.sheet} contentContainerStyle={[articleStyles.content, { paddingBottom: insets.bottom + 110 }]}>
        {note && (
          <FadeIn>
            <Text style={articleStyles.title}>{entryTitle(note.created_at)}</Text>
            <Text style={articleStyles.hook}>
              {formatTime(note.created_at)}
              {note.mood_label ? ` · feeling ${note.mood_label}` : ''}
            </Text>

            <View style={articleStyles.tiles}>
              <InfoTile label="Reading" value={`${Math.max(1, Math.round(words / 200))} min`} />
              <InfoTile label="Length" value={words === 1 ? '1 word' : `${words} words`} />
              {photos.length > 0 && <InfoTile label="Photos" value={String(photos.length)} />}
            </View>

            {first && <PhotoTile p={first} onPress={() => setViewing(0)} hero />}

            <View style={articleStyles.section}>
              {blocks.length ? blocks.map((b, i) => <BlockView key={i} block={b} onTick={tick} />) : <Text style={articleStyles.hook}>Just photos this time.</Text>}
            </View>

            {rest.map((p, i) => (
              <PhotoTile key={p.file} p={p} onPress={() => setViewing(i + 1)} />
            ))}

            {note.updated_at - note.created_at > 60_000 && (
              <Text style={styles.edited}>Edited {formatDate(note.updated_at)}</Text>
            )}
          </FadeIn>
        )}
      </ScrollView>

      <View style={[styles.fabRow, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
        <PressScale style={styles.fab} onPress={edit} scaleTo={0.94} accessibilityLabel="Edit this entry">
          <Ionicons name="create-outline" size={18} color={colors.accentText} />
          <Text style={styles.fabText}>Edit</Text>
        </PressScale>
      </View>

      <PhotoViewer uris={photos.map((p) => photoUri(p.file))} captions={photos.map((p) => p.caption)} start={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

function PhotoTile({ p, onPress, hero }: { p: Photo; onPress: () => void; hero?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={p.caption ? `Photo: ${p.caption}` : 'Open photo'} style={hero ? styles.hero : styles.photoWrap}>
      <Image source={{ uri: photoUri(p.file) }} style={styles.photo} resizeMode="cover" />
      {!!p.caption && <Text style={styles.caption}>{p.caption}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 8 },
  photoWrap: { marginTop: 10, marginBottom: 14 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.raised },
  caption: { fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 8, textAlign: 'center' },
  list: { marginBottom: 12 },
  item: { flexDirection: 'row', gap: 10 },
  bullet: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 29, color: colors.muted, minWidth: 16 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.line, paddingLeft: 14, marginBottom: 14 },
  box: { marginTop: 4 },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 18 },
  edited: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 18 },
  fabRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 26, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.accent },
  fabText: { fontFamily: fonts.sans, fontSize: 16, color: colors.accentText },
});
