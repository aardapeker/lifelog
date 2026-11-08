import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { articleStyles, paragraphs } from '../../components/Article';
import { FadeIn, PressScale } from '../../components/motion';
import { PhotoViewer } from '../../components/PhotoViewer';
import { IconButton, InfoTile } from '../../components/ui';
import { entryTitle, formatDate, formatTime, getNote, noteSong, type Note } from '../../lib/notes';
import { listPhotos, photoUri, type Photo } from '../../lib/photos';
import { colors, fonts, radius } from '../../lib/theme';

/** **bold** and *italic* inside a paragraph. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <Text key={i} style={{ fontFamily: fonts.serifBold, color: colors.text }}>
        {part.slice(2, -2)}
      </Text>
    ) : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <Text key={i} style={{ fontFamily: fonts.serifItalic }}>
        {part.slice(1, -1)}
      </Text>
    ) : (
      part
    ),
  );
}

/** One block of the entry: a heading, a list, a quote, or a plain paragraph. */
function Block({ text }: { text: string }) {
  const heading = text.match(/^#{1,3}\s+(.*)$/s);
  if (heading) return <Text style={articleStyles.heading}>{inline(heading[1])}</Text>;
  const lines = text.split('\n');
  if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
    return (
      <View style={styles.list}>
        {lines.map((l, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.bullet}>{/^\s*\d/.test(l) ? `${i + 1}.` : '•'}</Text>
            <Text style={[articleStyles.body, { flex: 1, marginBottom: 4 }]} selectable>
              {inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  if (lines.every((l) => l.startsWith('>'))) {
    return (
      <View style={styles.quote}>
        <Text style={[articleStyles.body, { fontFamily: fonts.serifItalic }]}>{inline(lines.map((l) => l.replace(/^>\s?/, '')).join('\n'))}</Text>
      </View>
    );
  }
  return (
    <Text style={articleStyles.body} selectable>
      {inline(text)}
    </Text>
  );
}

/** An entry to read, laid out like a blog post: headline, the song, the words, the photos full width. Edit is one tap away. */
export default function EntryScreen() {
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

  const edit = () => router.push(`/note/${id}`);
  const song = note ? noteSong(note) : null;
  const blocks = note ? paragraphs(note.body) : [];
  const words = note?.body.split(/\s+/).filter(Boolean).length ?? 0;
  const [first, ...rest] = photos;

  return (
    <View style={[articleStyles.screen, { paddingTop: insets.top + 8 }]}>
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

            {song && (
              <PressScale
                style={styles.song}
                scaleTo={0.97}
                onPress={() => Linking.openURL(`spotify:track:${song.id}`).catch(() => {})}
                accessibilityLabel={`Open ${song.name} in Spotify`}
              >
                {song.image ? <Image source={{ uri: song.image }} style={styles.songCover} /> : <Ionicons name="musical-notes" size={22} color={colors.muted} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.songSmall}>Playing while you wrote</Text>
                  <Text style={styles.songName} numberOfLines={1}>
                    {song.name}
                  </Text>
                  <Text style={styles.songSmall} numberOfLines={1}>
                    {song.artist}
                  </Text>
                </View>
                <Ionicons name="play-circle" size={30} color={colors.text} />
              </PressScale>
            )}

            <View style={articleStyles.tiles}>
              <InfoTile label="Reading" value={`${Math.max(1, Math.round(words / 200))} min`} />
              <InfoTile label="Length" value={words === 1 ? '1 word' : `${words} words`} />
              {photos.length > 0 && <InfoTile label="Photos" value={String(photos.length)} />}
            </View>

            {first && <PhotoTile p={first} onPress={() => setViewing(0)} hero />}

            <View style={articleStyles.section}>
              {blocks.length ? blocks.map((b, i) => <Block key={i} text={b} />) : <Text style={articleStyles.hook}>Just photos this time.</Text>}
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
  song: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 22, padding: 12, borderRadius: radius.md, backgroundColor: colors.raised },
  songCover: { width: 52, height: 52, borderRadius: 10 },
  songName: { fontFamily: fonts.sans, fontSize: 16, color: colors.text, marginVertical: 2 },
  songSmall: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  hero: { marginTop: 8 },
  photoWrap: { marginTop: 10, marginBottom: 14 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.raised },
  caption: { fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 8, textAlign: 'center' },
  list: { marginBottom: 12 },
  item: { flexDirection: 'row', gap: 10 },
  bullet: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 29, color: colors.muted, minWidth: 16 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.line, paddingLeft: 14, marginBottom: 14 },
  edited: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 18 },
  fabRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 26, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.accent },
  fabText: { fontFamily: fonts.sans, fontSize: 16, color: colors.accentText },
});
