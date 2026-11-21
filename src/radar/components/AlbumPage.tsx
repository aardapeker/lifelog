import { Linking, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../../components/Glass';
import { album, findAlbum, related, releases, type DzAlbum } from '../../lib/deezer';
import { radius } from '../../lib/theme';
import { useLoad } from '../hooks';
import { shortDate } from '../local/text';
import { colors, fonts, mono, ui } from '../theme';
import type { FeedItem } from '../types';
import { Pill } from './Pill';
import { ArtistRow, ReleaseRow, TrackList } from './Preview';
import { CoverArt, RemoteImage } from './RemoteImage';

/*
 * A new release's page, like Spotify's: the big cover, artist, type and date, label and length, the
 * tracklist with 30-second previews, the artist's other releases and "Fans also like". From Deezer.
 * Play opens it in Spotify (the item's link is a Spotify search).
 */

/** The Deezer album of a MUSIC card: its link, or (older MusicBrainz cards) a search by artist and title. */
async function albumOf(item: FeedItem): Promise<DzAlbum> {
  const id = Number(item.mediaUrl?.match(/deezer\.com\/album\/(\d+)/)?.[1]);
  if (id) return album(id);
  const [artist, ...rest] = item.title.split(' – ');
  const found = await findAlbum(artist, rest.join(' – ') || artist);
  if (!found) throw new Error('Deezer doesn\'t have this one yet.');
  return album(found.id);
}

export function AlbumPage({ item, save }: { item: FeedItem; save: { saved: boolean; toggle: () => void } }) {
  const page = useLoad(() => albumOf(item), [item.id]);
  const a = page.data;
  const more = useLoad(async () => {
    if (!a?.artist.id) return null;
    const [others, fans] = await Promise.all([releases(a.artist.id, 30).catch(() => []), related(a.artist.id, 10).catch(() => [])]);
    return { others: others.filter((o) => o.id !== a.id).slice(0, 12), fans };
  }, [a?.artist.id, a?.id]);

  return (
    <View style={styles.page}>
      <CoverArt uri={a?.cover ?? item.thumbnailUrl} name={item.title} style={styles.cover} />
      <Glass radius={radius.lg} style={styles.card}>
        <Text style={styles.title}>{a?.title ?? item.title}</Text>
        {a && (
          <View style={styles.by}>
            {a.artist.picture && <RemoteImage uri={a.artist.picture} style={styles.face} />}
            <Text style={styles.artist}>{a.artist.name}</Text>
          </View>
        )}
        <Text style={styles.meta}>
          {[a?.kind ?? item.author, a?.date && shortDate(a.date), a?.label, a?.minutes ? `${a.minutes} min` : null, a?.tracks.length ? `${a.tracks.length} tracks` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {!!a?.genres.length && <Text style={styles.genres}>{a.genres.join(' · ')}</Text>}
      </Glass>

      <View style={styles.actions}>
        <Pill label="Play on Spotify" icon="play" variant="solid" onPress={() => Linking.openURL(item.url)} />
        <Pill label={save.saved ? 'Saved' : 'Save'} icon={save.saved ? 'bookmark' : 'bookmark-outline'} variant={save.saved ? 'on' : 'plain'} onPress={save.toggle} />
      </View>

      {!a ? (
        <Text style={ui.muted}>{page.error ? `Couldn't load the tracklist: ${page.error.message}` : 'Loading the tracklist…'}</Text>
      ) : (
        <>
          {a.tracks.length > 0 && (
            <Glass radius={radius.lg} style={styles.card}>
              <Text style={styles.section}>Tracklist</Text>
              <TrackList tracks={a.tracks} owner={`album${a.id}`} artist={a.artist.name} />
            </Glass>
          )}
          {!!more.data?.others.length && (
            <View style={{ gap: 10 }}>
              <Text style={styles.section}>More from {a.artist.name}</Text>
              <ReleaseRow releases={more.data.others} artist={a.artist.name} />
            </View>
          )}
          {!!more.data?.fans.length && (
            <View style={{ gap: 10 }}>
              <Text style={styles.section}>Fans also like</Text>
              <ArtistRow artists={more.data.fans} />
            </View>
          )}
          <Text style={styles.small}>Data, covers and previews: Deezer.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  cover: { width: '82%', aspectRatio: 1, alignSelf: 'center', borderRadius: radius.lg, backgroundColor: colors.line },
  card: { padding: 16, gap: 8 },
  title: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 29 },
  by: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  face: { width: 26, height: 26, borderRadius: 13 },
  artist: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 17 },
  meta: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  genres: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 2 },
  small: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
});
