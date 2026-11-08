import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, PressScale, stagger } from '../components/motion';
import { useProfile } from '../components/TopBar';
import { IconButton } from '../components/ui';
import { getSetting, setSetting } from '../lib/db';
import { deletePhotoFile, pickPhoto, photoUri } from '../lib/photos';
import { colors, fonts, radius } from '../lib/theme';
import { SETTINGS_PAGES, type SettingsPage } from '../lib/settingsPages';

type Stats = { entries: number; words: number; since: number | null; milestones: number };

/** You: your photo and name, a few numbers about your journal, and the doors to every setting. */
export default function YouScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { name } = useProfile();
  const [photo, setPhoto] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSetting(db, 'profile.photo').then((p) => setPhoto(p || null));
      Promise.all([
        db.getFirstAsync<{ n: number; since: number | null; body: string }>(
          "SELECT COUNT(*) AS n, MIN(created_at) AS since, group_concat(body, ' ') AS body FROM notes",
        ),
        db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM milestones WHERE status = 'saved'"),
      ])
        .then(([n, m]) =>
          setStats({
            entries: n?.n ?? 0,
            words: n?.body ? n.body.split(/\s+/).filter(Boolean).length : 0,
            since: n?.since ?? null,
            milestones: m?.n ?? 0,
          }),
        )
        .catch(() => {});
    }, [db]),
  );

  const changePhoto = () => {
    const pick = async (source: 'camera' | 'library') => {
      try {
        const file = await pickPhoto(source);
        if (!file) return;
        if (photo) deletePhotoFile(photo);
        await setSetting(db, 'profile.photo', file);
        setPhoto(file);
      } catch (e) {
        Alert.alert("Couldn't change the photo", e instanceof Error ? e.message : String(e));
      }
    };
    Alert.alert('Your photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      ...(photo
        ? [
            {
              text: 'Remove',
              style: 'destructive' as const,
              onPress: async () => {
                deletePhotoFile(photo);
                await setSetting(db, 'profile.photo', '');
                setPhoto(null);
              },
            },
          ]
        : []),
      { text: 'Gallery', onPress: () => pick('library') },
      { text: 'Camera', onPress: () => pick('camera') },
    ]);
  };

  const days = stats?.since ? Math.max(1, Math.round((Date.now() - stats.since) / 86_400_000)) : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
      </View>

      <FadeIn style={styles.hero}>
        <PressScale onPress={changePhoto} scaleTo={0.94} accessibilityLabel="Change your photo">
          {photo ? (
            <Image source={{ uri: photoUri(photo) }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.letter]}>
              <Text style={styles.letterText}>{(name.trim()[0] ?? '✎').toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.camera}>
            <Ionicons name="camera" size={16} color={colors.accentText} />
          </View>
        </PressScale>
        <Text style={styles.name}>{name.trim() || 'You'}</Text>
        {stats && (
          <Text style={styles.stats}>
            {stats.entries} entries · {stats.words.toLocaleString('tr-TR')} words
            {days ? ` · ${days} days of journaling` : ''}
            {stats.milestones ? ` · ${stats.milestones} milestones` : ''}
          </Text>
        )}
      </FadeIn>

      <View style={styles.list}>
        {(Object.keys(SETTINGS_PAGES) as SettingsPage[]).map((key, i) => {
          const p = SETTINGS_PAGES[key];
          return (
            <FadeIn key={key} delay={stagger(i + 1, 50)}>
              <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]} onPress={() => router.push(`/settings/${key}`)}>
                <Text style={styles.emoji}>{p.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{p.title}</Text>
                  <Text style={styles.rowHint}>{p.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </FadeIn>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row' },
  hero: { alignItems: 'center', marginTop: 4, marginBottom: 28 },
  photo: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.raised },
  letter: { alignItems: 'center', justifyContent: 'center' },
  letterText: { fontFamily: fonts.serif, fontSize: 46, color: colors.text },
  camera: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  name: { fontFamily: fonts.serif, fontSize: 30, color: colors.text, marginTop: 14 },
  stats: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 6, textAlign: 'center' },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.md, backgroundColor: colors.surface },
  emoji: { fontSize: 24 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  rowHint: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3 },
});
