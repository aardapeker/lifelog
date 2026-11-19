import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../../components/Glass';
import { getKey } from '../../lib/keys';
import { radius } from '../../lib/theme';
import { useLoad } from '../hooks';
import { ageLine, personDetails } from '../local/tmdbDetails';
import { colors, fonts, mono, ui } from '../theme';
import { Pill } from './Pill';
import { PosterTile, Row, Section } from './MoviePage';
import { router } from 'expo-router';

/*
 * An actor's or director's page, opened from a movie page's cast or makers: photo, born, from,
 * the bio, their best-known titles and the whole list (newest and upcoming first). One TMDB call.
 */

const FIRST = 15; // the full list starts short; "Show all" opens the rest

export function PersonPage({ id }: { id: number }) {
  const page = useLoad(async () => {
    const key = await getKey('tmdb');
    if (!key) throw new Error('Add your TMDB key in Radar settings first.');
    return personDetails(id, key);
  }, [id]);
  const [all, setAll] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const p = page.data;
  if (!p) return <Text style={[ui.muted, { padding: 24 }]}>{page.error ? `Couldn't load it: ${page.error.message}` : 'Loading…'}</Text>;
  const age = ageLine(p.born, p.died);
  const credits = all ? p.credits : p.credits.slice(0, FIRST);
  return (
    <View style={styles.page}>
      <Glass radius={radius.lg} style={styles.top}>
        {p.photo ? <Image source={{ uri: p.photo }} style={styles.photo} resizeMode="cover" /> : <View style={[styles.photo, styles.blank]} />}
        <View style={styles.facts}>
          <Text style={styles.name}>{p.name}</Text>
          {p.known && <Text style={styles.meta}>{p.known}</Text>}
          {age && <Text style={styles.meta}>{age}</Text>}
          {p.place && <Text style={styles.meta}>{p.place}</Text>}
        </View>
      </Glass>

      {p.bio && (
        <Section title="Biography">
          <Text style={ui.body} numberOfLines={bioOpen ? undefined : 6}>
            {p.bio}
          </Text>
          {p.bio.length > 400 && (
            <Pressable onPress={() => setBioOpen(!bioOpen)} hitSlop={8}>
              <Text style={styles.more}>{bioOpen ? 'Show less' : 'Read more'}</Text>
            </Pressable>
          )}
        </Section>
      )}

      {p.knownFor.length > 0 && (
        <Row title="Known for">
          {p.knownFor.map((t) => (
            <PosterTile key={`${t.kind}${t.id}`} t={t} below={t.role || t.year || undefined} />
          ))}
        </Row>
      )}

      {p.credits.length > 0 && (
        <Section title={`Films & series (${p.credits.length})`}>
          {credits.map((c) => (
            <Pressable
              key={`${c.kind}${c.id}`}
              style={styles.credit}
              onPress={() => router.push({ pathname: '/radar/movie', params: { kind: c.kind, id: String(c.id) } })}
            >
              <Text style={styles.year}>{c.year ?? 'soon'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.creditTitle} numberOfLines={1}>
                  {c.title}
                  {c.kind === 'tv' ? <Text style={styles.small}> · series</Text> : null}
                </Text>
                {!!c.role && (
                  <Text style={styles.small} numberOfLines={1}>
                    {c.role}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
          {p.credits.length > FIRST && (
            <Pressable onPress={() => setAll(!all)} hitSlop={8}>
              <Text style={styles.more}>{all ? 'Show less' : `Show all ${p.credits.length}`}</Text>
            </Pressable>
          )}
        </Section>
      )}

      <View style={styles.actions}>
        <Pill label="TMDB" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(p.url, { toolbarColor: colors.ink, createTask: false })} />
      </View>
      <Text style={styles.small}>This product uses the TMDB API but is not endorsed or certified by TMDB.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  top: { padding: 14, flexDirection: 'row', gap: 16, alignItems: 'center' },
  photo: { width: 120, aspectRatio: 2 / 3, borderRadius: 14 },
  blank: { backgroundColor: 'rgba(255,255,255,0.08)' },
  facts: { flex: 1, gap: 4 },
  name: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 29 },
  meta: { color: colors.soft, fontFamily: mono, fontSize: 12 },
  more: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 14 },
  credit: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 5 },
  year: { width: 40, color: colors.muted, fontFamily: mono, fontSize: 12 },
  creditTitle: { color: colors.paper, fontFamily: fonts.sansRegular, fontSize: 15 },
  small: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
});
