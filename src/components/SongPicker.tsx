import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchTracks, spotifyLikedSongs, type Track } from '../lib/spotify';
import { colors, fonts, frost, inputColors, radius } from '../lib/theme';
import Ionicons from './Icon';
import { haptic } from './motion';

/*
 * Pick a song from Spotify: search (or paste a Spotify link), or one of your Liked Songs.
 * Used for "＋ Add a song" on the show's list and for live requests in the player.
 */

type Tab = 'search' | 'liked';

export function SongPicker({ visible, title, onPick, onClose }: { visible: boolean; title: string; onPick: (t: Track) => void; onClose: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [liked, setLiked] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const asked = useRef(0);

  // search as you type (a moment after the last key, and only the newest answer counts)
  useEffect(() => {
    if (!visible || tab !== 'search') return;
    const q = query.trim();
    if (!q) return setResults([]);
    const n = ++asked.current;
    const t = setTimeout(() => {
      setBusy(true);
      setError('');
      searchTracks(q)
        .then((r) => n === asked.current && setResults(r))
        .catch((e) => n === asked.current && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => n === asked.current && setBusy(false));
    }, 400);
    return () => clearTimeout(t);
  }, [query, tab, visible]);

  useEffect(() => {
    if (visible && tab === 'liked' && liked === null) spotifyLikedSongs(db).then(setLiked).catch(() => setLiked([]));
  }, [visible, tab, liked, db]);

  const close = () => {
    setQuery('');
    setResults([]);
    setError('');
    onClose();
  };
  const pick = (t: Track) => {
    haptic.tick();
    close();
    onPick(t);
  };
  const list = tab === 'search' ? results : (liked ?? []);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <View style={styles.tabs}>
            {(['search', 'liked'] as Tab[]).map((k) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]} accessibilityRole="tab">
                <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{k === 'search' ? '🔍 Search' : '❤️ Liked Songs'}</Text>
              </Pressable>
            ))}
          </View>
          {tab === 'search' && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Song, artist, or a Spotify link"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
              {...inputColors}
            />
          )}
          {busy || (tab === 'liked' && liked === null) ? <ActivityIndicator color={colors.text} style={{ marginVertical: 16 }} /> : null}
          {!!error && <Text style={styles.empty}>{error}</Text>}
          {!busy && !error && tab === 'search' && query.trim() && !results.length ? <Text style={styles.empty}>Nothing found. Try another spelling?</Text> : null}
          {tab === 'liked' && liked?.length === 0 ? <Text style={styles.empty}>No Liked Songs (or Spotify needs connecting again in Settings → Music).</Text> : null}
          <FlatList
            data={list}
            keyExtractor={(t) => t.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable onPress={() => pick(item)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} accessibilityRole="button" accessibilityLabel={`${item.name} by ${item.artist}`}>
                {item.image ? <Image source={{ uri: item.image }} style={styles.cover} /> : <View style={[styles.cover, styles.noCover]}><Ionicons name="musical-notes-outline" size={18} color={colors.muted} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={24} color={colors.text} />
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 10 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, textAlign: 'center', marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center', ...frost },
  tabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
  tabTextOn: { color: colors.accentText },
  input: { backgroundColor: colors.raised, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, color: colors.text, fontFamily: fonts.sansRegular, fontSize: 15, marginBottom: 6 },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginVertical: 14, paddingHorizontal: 12 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 6, borderRadius: radius.sm },
  rowPressed: { backgroundColor: colors.raised },
  cover: { width: 46, height: 46, borderRadius: 8 },
  noCover: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  artist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
});
