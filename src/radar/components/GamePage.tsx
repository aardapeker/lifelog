import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Glass } from '../../components/Glass';
import Ionicons from '../../components/Icon';
import { PhotoViewer } from '../../components/PhotoViewer';
import { fansText } from '../../lib/deezer';
import { radius } from '../../lib/theme';
import { useLoad } from '../hooks';
import { appIdOf, appUrl, details, money, news, reviews } from '../local/sources/steam';
import { shortDate, toPlainText } from '../local/text';
import { colors, fonts, mono, ui } from '../theme';
import type { FeedItem } from '../types';
import { Pill } from './Pill';
import { RemoteImage } from './RemoteImage';

/*
 * A game's page (from a GAME card): the header picture, price and discount, what players think
 * (Steam reviews + Metacritic), screenshots (tap for full screen), the trailer (only on tap), the
 * facts and the developers' latest posts. From Steam's public store API; "Open in Steam" for buying.
 */

const browse = (url: string) => WebBrowser.openBrowserAsync(url, { toolbarColor: colors.ink, createTask: false });

/** Steam's trailers are HLS streams: Android's WebView (Chrome) plays them in a plain <video>. */
const trailerPage = (src: string, poster: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%}</style></head>
<body><video src="${src}" poster="${poster}" controls autoplay playsinline></video></body></html>`;

export function GamePage({ item, save }: { item: FeedItem; save: { saved: boolean; toggle: () => void } }) {
  const id = appIdOf(item.url);
  const page = useLoad(async () => {
    if (!id) throw new Error('No Steam link on this one.');
    const [g, r, n] = await Promise.all([details(id), reviews(id).catch(() => null), news(id, 4).catch(() => [])]);
    if (!g) throw new Error("Steam doesn't show this game in Turkey.");
    return { g, r, n: n.filter((x) => x.feedname === 'steam_community_announcements').slice(0, 3) };
  }, [id]);
  const [photo, setPhoto] = useState<number | null>(null);
  const [trailer, setTrailer] = useState(false);
  const g = page.data?.g;
  const r = page.data?.r;
  const p = g?.price_overview;
  const movie = g?.movies?.find((m) => m.hls_h264);
  const shots = g?.screenshots ?? [];

  return (
    <View style={styles.page}>
      {trailer && movie?.hls_h264 ? (
        <View style={styles.hero}>
          <WebView source={{ html: trailerPage(movie.hls_h264, movie.thumbnail) }} style={{ flex: 1, backgroundColor: '#000' }} allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} />
        </View>
      ) : (
        <Pressable onPress={() => movie && setTrailer(true)} disabled={!movie} style={styles.hero} accessibilityLabel={movie ? 'Play the trailer' : undefined}>
          <RemoteImage uri={g?.header_image ?? item.thumbnailUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {movie && (
            <View style={styles.play}>
              <Ionicons name="play" size={26} color={colors.paper} />
            </View>
          )}
        </Pressable>
      )}

      <Glass radius={radius.lg} style={styles.card}>
        <Text style={styles.title}>{g?.name ?? item.title}</Text>
        {g && <Text style={styles.meta}>{[g.developers?.[0], g.release_date?.date].filter(Boolean).join(' · ')}</Text>}
        {/* the price, Steam style: the cut in green, the old price struck through */}
        {g && (
          <View style={styles.priceRow}>
            {p?.discount_percent ? <Text style={styles.cut}>−{p.discount_percent}%</Text> : null}
            {p?.discount_percent ? <Text style={styles.was}>{money(p.initial, p.currency)}</Text> : null}
            <Text style={styles.price}>{p ? money(p.final, p.currency) : g.is_free ? 'Free to play' : g.release_date?.coming_soon ? 'Coming soon' : '—'}</Text>
          </View>
        )}
        {item.title.startsWith('🎁') && <Text style={styles.free}>Free to keep: claim it on Steam before the offer ends ({item.author?.replace(/^Free to keep · /, '')}).</Text>}
        {(r || g?.metacritic) && (
          <Text style={styles.reviews}>
            {r && `${r.label} · ${Math.round((r.positive / r.total) * 100)}% of ${fansText(r.total)} reviews`}
            {r && g?.metacritic ? '  ·  ' : ''}
            {g?.metacritic && `Metacritic ${g.metacritic.score}`}
          </Text>
        )}
        {!!g?.genres?.length && <Text style={styles.genres}>{g.genres.map((x) => x.description).join(' · ')}</Text>}
        {g?.platforms && (
          <Text style={styles.meta}>
            {[g.platforms.windows && 'Windows', g.platforms.linux && 'Linux / Steam Deck'].filter(Boolean).join(' · ')}
          </Text>
        )}
      </Glass>

      <View style={styles.actions}>
        <Pill label="Open in Steam" icon="cart-outline" variant="solid" onPress={() => id && Linking.openURL(appUrl(id))} />
        <Pill label={save.saved ? 'Saved' : 'Save'} icon={save.saved ? 'bookmark' : 'bookmark-outline'} variant={save.saved ? 'on' : 'plain'} onPress={save.toggle} />
      </View>

      {!g ? (
        <Text style={ui.muted}>{page.error ? `Couldn't load the game: ${page.error.message}` : 'Loading the game…'}</Text>
      ) : (
        <>
          {g.short_description && <Text style={ui.body}>{toPlainText(g.short_description)}</Text>}
          {shots.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {shots.slice(0, 10).map((s, i) => (
                <Pressable key={s.id} onPress={() => setPhoto(i)} accessibilityLabel={`Screenshot ${i + 1}`}>
                  <RemoteImage uri={s.path_thumbnail} style={styles.shot} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}
          {page.data!.n.length > 0 && (
            <Glass radius={radius.lg} style={styles.card}>
              <Text style={styles.section}>From the developers</Text>
              {page.data!.n.map((n) => (
                <Pressable key={n.gid} onPress={() => browse(n.url)} style={styles.news}>
                  <Text style={styles.newsTitle}>{n.title}</Text>
                  <Text style={styles.small}>{shortDate(n.date * 1000)}</Text>
                </Pressable>
              ))}
            </Glass>
          )}
          <Text style={styles.small}>Data: Steam store. Prices for Turkey.</Text>
        </>
      )}
      <PhotoViewer uris={shots.slice(0, 10).map((s) => s.path_full)} start={photo} onClose={() => setPhoto(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  hero: { width: '100%', aspectRatio: 460 / 215, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, gap: 8 },
  title: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 29 },
  meta: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  cut: { color: '#BEEE11', backgroundColor: '#4C6B22', fontFamily: fonts.sansBold, fontSize: 15, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  was: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 14, textDecorationLine: 'line-through' },
  price: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 20 },
  free: { color: '#5BE0A0', fontFamily: fonts.sansBold, fontSize: 14 },
  reviews: { color: '#8FD3FF', fontFamily: fonts.sansRegular, fontSize: 14 },
  genres: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shot: { width: 240, aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.line },
  section: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 16 },
  news: { paddingVertical: 6, gap: 2 },
  newsTitle: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 15 },
  small: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
});
