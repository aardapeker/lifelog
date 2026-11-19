import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Glass } from "../../components/Glass";
import Ionicons from "../../components/Icon";
import { getKey } from "../../lib/keys";
import { radius } from "../../lib/theme";
import { useLoad } from "../hooks";
import {
  movieDetails,
  type Kind,
  type MovieDetails,
  type Title,
  type Person,
  type Provider,
} from "../local/tmdbDetails";
import { colors, fonts, mono, ui } from "../theme";
import type { FeedItem } from "../types";
import { Pill } from "./Pill";
import { VideoPlayer } from "./VideoPlayer";

/*
 * A film or series page in Lifelog's glass style: backdrop, poster and the facts on top, then the
 * trailer, plot, cast, where to watch in Turkey and similar titles. One TMDB call (tmdbDetails.ts).
 * Opened from a MOVIE card (with Save) or from "More like this" (route /radar/movie).
 */

/** People open their own page in Radar, not TMDB's site. */
export const openPerson = (id: number) => router.push({ pathname: "/radar/person", params: { id: String(id) } });

const browse = (url: string) =>
  WebBrowser.openBrowserAsync(url, {
    toolbarColor: colors.ink,
    createTask: false,
  });

/** 167 → "2h 47m" */
const hours = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
/** 6123 → "6.1k" */
const count = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

export function MoviePage({
  kind,
  id,
  save,
}: {
  kind: Kind;
  id: number;
  save?: { saved: boolean; toggle: () => void };
}) {
  const page = useLoad(async () => {
    const key = await getKey("tmdb");
    if (!key) throw new Error("Add your TMDB key in Radar settings first.");
    return movieDetails(kind, id, key);
  }, [kind, id]);
  if (!page.data)
    return (
      <Text style={[ui.muted, { padding: 24 }]}>
        {page.error ? `Couldn't load it: ${page.error.message}` : "Loading…"}
      </Text>
    );
  return <Details m={page.data} save={save} />;
}

function Details({
  m,
  save,
}: {
  m: MovieDetails;
  save?: { saved: boolean; toggle: () => void };
}) {
  const [trailer, setTrailer] = useState(false);
  const facts = [
    m.year,
    m.runtime ? hours(m.runtime) + (m.series ? " / ep" : "") : null,
    m.certification,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.page}>
      {/* the backdrop, fading into the page; the facts panel sits over its lower edge */}
      <View style={styles.backdrop}>
        {m.backdrop ? (
          <Image
            source={{ uri: m.backdrop }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <Glass radius={radius.lg} style={styles.top}>
        <View style={styles.topRow}>
          {m.poster ? (
            <Image
              source={{ uri: m.poster }}
              style={styles.poster}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.poster, styles.blank]} />
          )}
          <View style={styles.facts}>
            <Text style={styles.title}>{m.title}</Text>
            {!!facts && <Text style={styles.meta}>{facts}</Text>}
            {m.rating != null && (
              <Text style={styles.rating}>
                ★ {m.rating.toFixed(1)}
                <Text style={styles.votes}> /10 · {count(m.votes)} votes</Text>
              </Text>
            )}
            {m.series && (
              <Text style={styles.meta}>
                {m.series.seasons} season{m.series.seasons === 1 ? "" : "s"} ·{" "}
                {m.series.episodes} episodes
              </Text>
            )}
          </View>
        </View>
        {m.genres.length > 0 && (
          <View style={styles.genres}>
            {m.genres.map((g) => (
              <Text key={g} style={styles.genre}>
                {g}
              </Text>
            ))}
          </View>
        )}
      </Glass>

      <View style={styles.actions}>
        {m.trailer && (
          <Pill
            label={trailer ? "Hide trailer" : "Trailer"}
            icon={trailer ? "close" : "play"}
            variant="solid"
            onPress={() => setTrailer(!trailer)}
          />
        )}
        {save && (
          <Pill
            label={save.saved ? "Saved" : "Save"}
            icon={save.saved ? "bookmark" : "bookmark-outline"}
            variant={save.saved ? "on" : "plain"}
            onPress={save.toggle}
          />
        )}
        <Pill label="TMDB" icon="open-outline" onPress={() => browse(m.url)} />
      </View>
      {trailer && m.trailer && <VideoPlayer item={trailerItem(m)} autoPlay />}

      {(m.overview ||
        m.tagline ||
        m.makers.people.length > 0 ||
        m.series?.next) && (
        <Section title="Story">
          {m.tagline && <Text style={styles.tagline}>“{m.tagline}”</Text>}
          {m.overview && <Text style={ui.body}>{m.overview}</Text>}
          {m.makers.people.length > 0 && (
            <Text style={styles.line}>
              <Text style={styles.lineLabel}>{m.makers.label} </Text>
              {m.makers.people.map((p, i) => (
                <Text key={p.id}>
                  {i > 0 ? ", " : ""}
                  <Text style={styles.link} onPress={() => openPerson(p.id)}>
                    {p.name}
                  </Text>
                </Text>
              ))}
            </Text>
          )}
          {m.series?.next && (
            <Text style={styles.line}>
              <Text style={styles.lineLabel}>Next episode </Text>
              {m.series.next}
            </Text>
          )}
          {m.series?.status && !m.series.next && (
            <Text style={styles.line}>
              <Text style={styles.lineLabel}>Status </Text>
              {m.series.status}
            </Text>
          )}
        </Section>
      )}

      {m.cast.length > 0 && (
        <Row title="Top cast">
          {m.cast.map((p) => (
            <CastMember key={p.id} p={p} />
          ))}
        </Row>
      )}

      {(m.watch.stream.length > 0 || m.watch.rent.length > 0) && (
        <Section title="Where to watch in Turkey">
          {m.watch.stream.length > 0 && (
            <Providers label="Stream" list={m.watch.stream} />
          )}
          {m.watch.rent.length > 0 && (
            <Providers label="Rent or buy" list={m.watch.rent} />
          )}
          <Pressable
            onPress={() => m.watch.link && browse(m.watch.link)}
            disabled={!m.watch.link}
          >
            <Text style={styles.credit}>
              Streaming data by JustWatch{m.watch.link ? " · see all" : ""}
            </Text>
          </Pressable>
        </Section>
      )}

      {m.similar.length > 0 && (
        <Row title="More like this">
          {m.similar.map((s) => (
            <PosterTile key={`${s.kind}${s.id}`} t={s} />
          ))}
        </Row>
      )}

      <Text style={styles.credit}>
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </Text>
    </View>
  );
}

/** The trailer as a video item, so the Radar video player (thumbnail first, then the player) can show it. */
const trailerItem = (m: MovieDetails): FeedItem =>
  ({
    id: `trailer-${m.id}`,
    type: "VIDEO",
    url: `https://www.youtube.com/watch?v=${m.trailer}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${m.trailer}/hqdefault.jpg`,
    title: `${m.title} trailer`,
    durationSeconds: null,
  }) as FeedItem;

/** A title's poster that opens its own page (similar titles, a person's films). */
export function PosterTile({ t, below }: { t: Title; below?: string }) {
  return (
    <Pressable style={styles.similar} onPress={() => router.push({ pathname: "/radar/movie", params: { kind: t.kind, id: String(t.id) } })}>
      <Image source={{ uri: t.poster ?? undefined }} style={styles.similarPoster} resizeMode="cover" />
      <Text style={styles.similarTitle} numberOfLines={2}>
        {t.title}
      </Text>
      {(below ?? t.year) && (
        <Text style={styles.small} numberOfLines={1}>
          {below ?? t.year}
        </Text>
      )}
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Glass radius={radius.lg} style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Glass>
  );
}

/** A titled row that scrolls sideways (cast, similar titles). */
export function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.sectionTitle, { paddingHorizontal: 4 }]}>
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function CastMember({ p }: { p: Person }) {
  return (
    <Pressable
      style={styles.person}
      onPress={() => openPerson(p.id)}
    >
      {p.photo ? (
        <Image
          source={{ uri: p.photo }}
          style={styles.face}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.face, styles.blank]}>
          <Ionicons name="person" size={28} color={colors.muted} />
        </View>
      )}
      <Text style={styles.personName} numberOfLines={2}>
        {p.name}
      </Text>
      {!!p.role && (
        <Text style={styles.small} numberOfLines={2}>
          {p.role}
        </Text>
      )}
    </Pressable>
  );
}

function Providers({ label, list }: { label: string; list: Provider[] }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.lineLabel}>{label}</Text>
      <View style={styles.providers}>
        {list.map((p) => (
          <View key={p.name} style={styles.provider}>
            {p.logo ? (
              <Image source={{ uri: p.logo }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.blank]} />
            )}
            <Text style={styles.small} numberOfLines={1}>
              {p.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  backdrop: {
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.line,
  },
  top: { marginTop: -56, marginHorizontal: 8, padding: 14, gap: 12 },
  topRow: { flexDirection: "row", gap: 14 },
  poster: { width: 104, aspectRatio: 2 / 3, borderRadius: 12, marginTop: -40 },
  blank: {
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  facts: { flex: 1, gap: 4 },
  title: {
    color: colors.paper,
    fontFamily: fonts.sansBold,
    fontSize: 22,
    lineHeight: 27,
  },
  meta: { color: colors.soft, fontFamily: mono, fontSize: 12 },
  rating: {
    color: "#F5C211",
    fontFamily: fonts.sansBold,
    fontSize: 18,
    marginTop: 2,
  },
  votes: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 13 },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  genre: {
    color: colors.paper,
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  section: { padding: 16, gap: 10 },
  sectionTitle: {
    color: colors.paper,
    fontFamily: fonts.sansBold,
    fontSize: 16,
  },
  tagline: { color: colors.soft, fontFamily: fonts.serifItalic, fontSize: 15 },
  line: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 14 },
  link: { color: colors.paper, textDecorationLine: "underline" },
  lineLabel: {
    color: colors.muted,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
  },
  row: { gap: 12, paddingHorizontal: 4 },
  person: { width: 84, alignItems: "center", gap: 4 },
  face: { width: 72, height: 72, borderRadius: 36 },
  personName: {
    color: colors.paper,
    fontFamily: fonts.sansBold,
    fontSize: 12,
    textAlign: "center",
  },
  small: {
    color: colors.muted,
    fontFamily: fonts.sansRegular,
    fontSize: 11,
    textAlign: "center",
  },
  providers: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  provider: { width: 64, alignItems: "center", gap: 4 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  credit: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 11 },
  similar: { width: 104, gap: 4 },
  similarPoster: {
    width: 104,
    aspectRatio: 2 / 3,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  similarTitle: {
    color: colors.paper,
    fontFamily: fonts.sansRegular,
    fontSize: 12,
  },
});
