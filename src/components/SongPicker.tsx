import { previewOf } from '../lib/deezer';
import { cleanTitle } from '../lib/songInfo';
import { isrcOf } from '../lib/spotify';
import { stopPreview, usePreview } from '../radar/components/Preview';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchTracks, spotifyLikedSongs, type Track } from '../lib/spotify';
import { colors, fonts, frost, inputColors, radius, glassField } from '../lib/theme';
import { useKeyboardHeight } from '../lib/useKeyboardVisible';
import { useSwipeToClose } from '../lib/useSwipeToClose';
import Ionicons from './Icon';
import { haptic } from './motion';

/*
 * Pick a song from Spotify: search (or paste a Spotify link), or one of your Liked Songs.
 * Used for "＋ Add a song" on the show's list and for live requests in the player.
 */

type Tab = 'search' | 'liked';

/**
 * `multi`: stays open after a pick (like adding songs to a Spotify playlist): every + turns into ✓ and
 * Done closes it. `chosen`: songs already in the list, shown as ✓ from the start.
 * Tapping a cover plays a 30-second preview (Deezer), to check a song you don't know before adding it.
 */
export function SongPicker({
  visible,
  title,
  onPick,
  onClose,
  multi = false,
  chosen,
}: {
  visible: boolean;
  title: string;
  onPick: (t: Track) => void;
  onClose: () => void;
  multi?: boolean;
  chosen?: ReadonlySet<string>;
}) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight(); // the sheet sits on top of the keyboard, not under it
  const { height: screen } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [liked, setLiked] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const asked = useRef(0);
  const [added, setAdded] = useState<Set<string>>(new Set()); // picked while this sheet is open
  const pv = usePreview('picker');
  const isIn = (t: Track) => added.has(t.id) || !!chosen?.has(t.id);

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
    stopPreview();
    setQuery('');
    setResults([]);
    setError('');
    setAdded(new Set());
    onClose();
  };
  const pick = (t: Track) => {
    haptic.tick();
    if (!multi) {
      close();
      return onPick(t);
    }
    if (isIn(t)) return; // already on the list
    onPick(t);
    setAdded((a) => new Set(a).add(t.id));
  };
  const list = tab === 'search' ? results : (liked ?? []);
  // swipe the sheet down to close it, like the player (it stays mounted: back up when it opens again)
  const swipe = useSwipeToClose(close);
  useEffect(() => {
    if (visible) swipe.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close">
        <Animated.View style={swipe.style} {...swipe.panHandlers}>
        <Pressable style={[styles.sheet, keyboard ? { marginBottom: keyboard, paddingBottom: 12, maxHeight: screen - keyboard - insets.top - 12 } : { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={[styles.title, multi && { flex: 1, textAlign: 'left' }]}>{title}</Text>
            {multi && (
              <Pressable onPress={close} style={styles.done} accessibilityRole="button">
                <Text style={styles.doneText}>{added.size ? `Done · ${added.size} added` : 'Done'}</Text>
              </Pressable>
            )}
          </View>
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
            onScroll={swipe.onScroll}
            scrollEventThrottle={32}
            renderItem={({ item }) => (
              <Pressable onPress={() => pick(item)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} accessibilityRole="button" accessibilityLabel={`${isIn(item) ? 'Added' : 'Add'} ${item.name} by ${item.artist}`}>
                {/* the cover plays a preview; the rest of the row adds the song */}
                <Pressable
                  onPress={() => pv.toggleFind(item.id, async () => previewOf(item.artist, cleanTitle(item.name), await isrcOf(item.id)))}
                  hitSlop={4}
                  accessibilityLabel={`${pv.is(item.id) ? 'Stop' : 'Play'} a preview of ${item.name}`}
                >
                  {item.image ? <Image source={{ uri: item.image }} style={styles.cover} /> : <View style={[styles.cover, styles.noCover]} />}
                  <View style={[styles.coverPlay, pv.is(item.id) && { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                    {pv.finding(item.id) ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Ionicons name={pv.is(item.id) ? 'pause' : pv.noPreview(item.id) ? 'volume-mute' : 'play'} size={16} color={colors.text} />
                    )}
                  </View>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, pv.is(item.id) && { color: '#5BE0A0' }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
                  {pv.is(item.id) && (
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${pv.progress * 100}%` }]} />
                    </View>
                  )}
                </View>
                <Ionicons name={isIn(item) ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={isIn(item) ? '#5BE0A0' : colors.text} />
              </Pressable>
            )}
          />
        </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 10 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 },
  done: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  doneText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.accentText },
  coverPlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  bar: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 5, overflow: 'hidden' },
  barFill: { height: 2, backgroundColor: '#5BE0A0' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center', ...frost },
  tabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
  tabTextOn: { color: colors.accentText },
  input: { ...glassField, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, color: colors.text, fontFamily: fonts.sansRegular, fontSize: 15, marginBottom: 6 },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginVertical: 14, paddingHorizontal: 12 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 6, borderRadius: radius.sm },
  rowPressed: { backgroundColor: colors.raised },
  cover: { width: 46, height: 46, borderRadius: 8 },
  noCover: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  artist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
});
