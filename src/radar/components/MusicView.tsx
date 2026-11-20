import { useSQLiteContext } from 'expo-sqlite';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '../../components/Icon';
import { topArtists, type TopArtist } from '../../lib/spotify';
import { musicArtists } from '../local/sources/musicbrainz';
import { colors, fonts } from '../theme';
import type { FeedItem, Topic } from '../types';
import { FeedCard } from './FeedCard';

/*
 * A music topic's feed, instead of the plain list: a row of artist tabs (round photos from Spotify,
 * "All" first), the new releases as a grid of big covers, and the topic's music news under them.
 * Tapping an artist shows only theirs. Releases open the album page.
 */

const GAP = 12;

/** "Radiohead – In Rainbows" is Radiohead's (the card title starts with the artist credit). */
const byArtist = (item: FeedItem, artist: string) => item.title.toLowerCase().startsWith(artist.toLowerCase());
const mentions = (item: FeedItem, artist: string) => item.title.toLowerCase().includes(artist.toLowerCase());

export function MusicView({ topic, items, onOpen }: { topic: Topic; items: FeedItem[]; onOpen: (item: FeedItem) => void }) {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [spotify, setSpotify] = useState<TopArtist[]>([]);
  const [artist, setArtist] = useState<string | null>(null);
  useEffect(() => {
    if (topic.sources.spotifyArtists) topArtists(db).then(setSpotify).catch(() => {});
  }, [db, topic.sources.spotifyArtists]);

  const artists = useMemo(() => {
    const names = musicArtists(topic.sources, spotify.map((a) => a.name));
    const photo = new Map(spotify.map((a) => [a.name.toLowerCase(), a.image]));
    // artists with something new first, so the tabs open on the interesting ones
    const has = (n: string) => items.some((i) => i.type === 'MUSIC' && byArtist(i, n));
    return names.map((name) => ({ name, image: photo.get(name.toLowerCase()) ?? null })).sort((a, b) => Number(has(b.name)) - Number(has(a.name)));
  }, [topic.sources, spotify, items]);

  const releases = items.filter((i) => i.type === 'MUSIC' && (!artist || byArtist(i, artist)));
  const news = items.filter((i) => i.type !== 'MUSIC' && (!artist || mentions(i, artist)));
  const tile = (width - 32 - GAP) / 2;

  return (
    <View style={{ gap: 18 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        <Tab label="All" on={!artist} onPress={() => setArtist(null)} />
        {artists.map((a) => (
          <Tab key={a.name} label={a.name} image={a.image} on={artist === a.name} onPress={() => setArtist(artist === a.name ? null : a.name)} />
        ))}
      </ScrollView>

      {releases.length > 0 ? (
        <View style={styles.grid}>
          {releases.map((r) => (
            <Pressable key={r.id} onPress={() => onOpen(r)} style={[styles.release, { width: tile }]}>
              <View style={[styles.coverBox, { width: tile, height: tile }]}>
                {r.thumbnailUrl ? <Image source={{ uri: r.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                <Ionicons name="disc-outline" size={36} color="rgba(255,255,255,0.25)" style={styles.discBehind} />
                <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={styles.coverFade} />
                {!r.read && <View style={styles.newDot} />}
                {r.author?.includes('out ') && <Text style={styles.soon}>SOON</Text>}
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {r.title.split(' – ').slice(1).join(' – ') || r.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[r.title.split(' – ')[0], r.author].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>
          {!artists.length
            ? 'No artists yet: turn on "My top Spotify artists" in this topic (⚙), or add some by name.'
            : artist
              ? `Nothing new from ${artist} in the last six weeks. New releases land here as they come out.`
              : 'No new releases in the last six weeks yet. They land here as they come out.'}
        </Text>
      )}

      {news.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={styles.section}>News</Text>
          {news.map((n) => (
            <FeedCard key={n.id} item={n} onPress={() => onOpen(n)} />
          ))}
        </View>
      )}
    </View>
  );
}

/** One artist tab: a round photo (or initials) with the name under it; the open one glows. */
function Tab({ label, image, on, onPress }: { label: string; image?: string | null; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
      <View style={[styles.ring, on && styles.ringOn]}>
        {label === 'All' ? (
          <View style={[styles.avatar, styles.initials]}>
            <Ionicons name="musical-notes" size={24} color={colors.paper} />
          </View>
        ) : image ? (
          <Image source={{ uri: image }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.initials]}>
            <Text style={styles.initialsText}>
              {label
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, on && { color: colors.paper }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const AVATAR = 62;

const styles = StyleSheet.create({
  tabs: { gap: 14, paddingHorizontal: 2, paddingVertical: 2 },
  tab: { width: AVATAR + 12, alignItems: 'center', gap: 6 },
  ring: { padding: 3, borderRadius: (AVATAR + 6) / 2, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: colors.paper, boxShadow: '0 0 14px 2px rgba(255,255,255,0.35)' },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  initials: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 20 },
  tabLabel: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  release: { gap: 6, marginBottom: 6 },
  coverBox: { borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  discBehind: { position: 'absolute' }, // shows only while (or if) there's no cover
  coverFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%' },
  newDot: { position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: '#5BE0A0' },
  soon: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    color: colors.paper,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
  },
  title: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 19 },
  meta: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
  section: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 17 },
  empty: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12 },
});
