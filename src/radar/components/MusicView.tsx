import { useSQLiteContext } from 'expo-sqlite';
import { CoverArt } from './RemoteImage';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '../../components/Icon';
import { fansText, findArtist, norm, related, releases as artistReleases, suggest, topTracks, type DzArtist } from '../../lib/deezer';
import { topArtists, type TopArtist } from '../../lib/spotify';
import { useLoad } from '../hooks';
import { musicArtists } from '../local/sources/deezer';
import { colors, fonts, mono } from '../theme';
import type { FeedItem, Topic } from '../types';
import { FeedCard } from './FeedCard';
import { ArtistRow, ReleaseRow, TrackList } from './Preview';
import { RemoteImage } from './RemoteImage';

/*
 * A music topic's feed, instead of the plain list, a bit like Spotify: a row of artist tabs (round
 * photos from Spotify, else Deezer; "All" first), the new releases as a grid of big covers, "You might
 * like" (artists your artists' fans like), and the topic's music news. Tapping an artist opens their
 * page: popular songs with 30-second previews, discography, fans also like, then only their news.
 * Releases open the album page.
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
  const [photos, setPhotos] = useState<Record<string, string>>({}); // Deezer's, for artists Spotify gave none
  useEffect(() => {
    if (topic.sources.spotifyArtists) topArtists(db).then(setSpotify).catch(() => {});
  }, [db, topic.sources.spotifyArtists]);

  const artists = useMemo(() => {
    const names = musicArtists(topic.sources, spotify.map((a) => a.name));
    const photo = new Map(spotify.map((a) => [norm(a.name), a.image]));
    // artists with something new first, so the tabs open on the interesting ones
    const has = (n: string) => items.some((i) => i.type === 'MUSIC' && byArtist(i, n));
    return names.map((name) => ({ name, image: photo.get(norm(name)) ?? photos[norm(name)] ?? null })).sort((a, b) => Number(has(b.name)) - Number(has(a.name)));
  }, [topic.sources, spotify, items, photos]);

  // photos for the ones typed in by hand (Radiohead was just an "R")
  const missing = artists.filter((a) => !a.image && !(norm(a.name) in photos)).map((a) => a.name);
  useEffect(() => {
    let live = true;
    for (const name of missing)
      findArtist(name)
        .then((a) => live && setPhotos((p) => ({ ...p, [norm(name)]: a?.picture ?? '' })))
        .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.join('|')]);

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

      {artist && <ArtistPanel name={artist} />}
      {artist && releases.length > 0 && <Text style={styles.section}>New from {artist}</Text>}

      {releases.length > 0 ? (
        <View style={styles.grid}>
          {releases.map((r) => (
            <Pressable key={r.id} onPress={() => onOpen(r)} style={[styles.release, { width: tile }]}>
              <View style={[styles.coverBox, { width: tile, height: tile }]}>
                <CoverArt uri={r.thumbnailUrl} name={r.title} style={StyleSheet.absoluteFill} />
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
              ? `Nothing new from ${artist} in the last six weeks. New releases land here.`
              : 'No new releases in the last six weeks yet. They land here as they come out.'}
        </Text>
      )}

      {!artist && artists.length > 0 && <Discover following={artists.map((a) => a.name)} />}

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

/** An artist's page under the tabs: photo and fans, popular songs (previews), discography, fans also like. */
function ArtistPanel({ name }: { name: string }) {
  const page = useLoad(async () => {
    const a = await findArtist(name);
    if (!a) return null;
    const [top, discs, fans] = await Promise.all([
      topTracks(a.id, 5).catch(() => []),
      artistReleases(a.id, 30).catch(() => []),
      related(a.id, 10).catch(() => []),
    ]);
    return { a, top, discs: discs.filter((r) => r.kind !== 'Compilation').slice(0, 12), fans };
  }, [name]);
  const p = page.data;
  if (!p) return <Text style={styles.empty}>{page.isPending ? `Looking up ${name}…` : page.error ? `Couldn't load ${name}: ${page.error.message}` : `Deezer doesn't know ${name}.`}</Text>;
  return (
    <View style={{ gap: 18 }}>
      <View style={styles.hero}>
        {p.a.picture && <RemoteImage uri={p.a.picture} style={styles.heroPhoto} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.heroName}>{p.a.name}</Text>
          <Text style={styles.heroMeta}>{[p.a.fans && `${fansText(p.a.fans)} fans`, p.a.albums && `${p.a.albums} releases`].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      {p.top.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={styles.section}>Popular</Text>
          <TrackList tracks={p.top} owner={`artist${p.a.id}`} covers artist={p.a.name} />
        </View>
      )}
      {p.discs.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={styles.section}>Discography</Text>
          <ReleaseRow releases={p.discs} artist={p.a.name} />
        </View>
      )}
      {p.fans.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={styles.section}>Fans also like</Text>
          <ArtistRow artists={p.fans} />
        </View>
      )}
    </View>
  );
}

/** "You might like": artists that several of your artists' fans like, minus the ones you follow. */
function Discover({ following }: { following: string[] }) {
  const seeds = following.slice(0, 5);
  const page = useLoad(async () => {
    const mine = new Set(following.map(norm));
    const lists = await Promise.all(seeds.map((n) => findArtist(n).then((a) => (a ? related(a.id, 15) : [])).catch(() => [] as DzArtist[])));
    return suggest(lists, mine);
  }, [seeds.join('|')]);
  if (!page.data?.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.section}>You might like</Text>
      <ArtistRow artists={page.data} />
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
          <RemoteImage uri={image} style={styles.avatar} />
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
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroPhoto: { width: 96, height: 96, borderRadius: 48 },
  heroName: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 24 },
  heroMeta: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  empty: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12 },
});
