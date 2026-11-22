import * as WebBrowser from 'expo-web-browser';
import { withAgent } from '../radar/components/RemoteImage';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { fansText } from '../lib/deezer';
import { songInfo, type SongInfo } from '../lib/songInfo';
import { ArtistRow } from '../radar/components/Preview';
import { colors, fonts } from '../lib/theme';
import { Glass } from './Glass';
import Ionicons from './Icon';

/*
 * Under the player, like Spotify's "About the artist": folded to one line until you open it (so
 * Deezer and Wikipedia are only asked when you want to know), then the song's album, year, tempo and
 * genres, the artist's card with photo, fans and bio, and who their fans also like.
 * Follows the song: the next one opens folded again.
 */

type Track = { id: string; name: string; artist: string };

const year = (d: string | null) => d?.slice(0, 4) ?? null;

export function SongAbout({ track }: { track: Track }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<SongInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  useEffect(() => {
    setInfo(null);
    setFailed(false);
    setBioOpen(false);
  }, [track.id]);
  useEffect(() => {
    if (!open || info) return;
    let live = true;
    songInfo(track.id, track.name, track.artist)
      .then((i) => live && setInfo(i))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, info, track]);

  const a = info?.artist;
  return (
    <Glass radius={22} style={styles.card} fill="rgba(20, 19, 19, 0.38)">
      <Pressable onPress={() => setOpen(!open)} style={styles.head} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.label}>ABOUT THE SONG & ARTIST</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open &&
        (failed ? (
          <Text style={styles.muted}>Couldn't look it up right now.</Text>
        ) : !info ? (
          <Text style={styles.muted}>Looking it up…</Text>
        ) : !a && !info.album ? (
          <Text style={styles.muted}>Deezer doesn't know this one.</Text>
        ) : (
          <View style={{ gap: 18 }}>
            {/* the song: a small table, labels in one column, values lined up in the next */}
            <View style={{ gap: 8 }}>
              {(info.album || info.released) && <Fact label="From" value={[info.album, year(info.released)].filter(Boolean).join(' · ')} />}
              {info.genres.length > 0 && <Fact label="Genre" value={info.genres.join(', ')} />}
              {!!info.bpm && <Fact label="Tempo" value={`${info.bpm} BPM`} />}
              {info.label && <Fact label="Label" value={info.label} />}
            </View>
            {/* the artist */}
            {a && (
              <View style={[styles.section, { gap: 12 }]}>
                <View style={styles.artistRow}>
                  {a.photo ? <Image source={withAgent(a.photo)} style={styles.photo} /> : null}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.name}>{a.name}</Text>
                    {a.about && <Text style={styles.genres}>{a.about[0].toUpperCase() + a.about.slice(1)}</Text>}
                    {a.fans > 0 && (
                      <Text style={styles.muted}>
                        {fansText(a.fans)} fans on Deezer{a.releases ? ` · ${a.releases} releases` : ''}
                      </Text>
                    )}
                  </View>
                </View>
                {a.bio && (
                  <Pressable onPress={() => setBioOpen(!bioOpen)}>
                    <Text style={styles.bio} numberOfLines={bioOpen ? undefined : 4}>
                      {a.bio}
                    </Text>
                  </Pressable>
                )}
                {a.wiki && (
                  <Pressable onPress={() => WebBrowser.openBrowserAsync(a.wiki!, { createTask: false })} hitSlop={6}>
                    <Text style={styles.link}>Wikipedia →</Text>
                  </Pressable>
                )}
              </View>
            )}
            {info.alsoLike.length > 0 && (
              <View style={[styles.section, { gap: 12 }]}>
                <Text style={styles.label}>FANS ALSO LIKE</Text>
                <ArtistRow artists={info.alsoLike} />
              </View>
            )}
            <Text style={styles.credit}>Deezer · Wikipedia</Text>
          </View>
        ))}
    </Glass>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={[styles.muted, styles.factLabel]}>{label}</Text>
      <Text style={[styles.fact, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, marginTop: 18, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  muted: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
  fact: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.text, lineHeight: 22 },
  factRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  factLabel: { width: 58, fontSize: 13 },
  section: { paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)' }, // a thin line between song, artist and "fans also like"
  artistRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photo: { width: 72, height: 72, borderRadius: 36 },
  name: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  genres: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.text, opacity: 0.8 },
  bio: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 24, color: colors.text, opacity: 0.9, textAlign: 'justify' },
  link: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  credit: { fontFamily: fonts.sansRegular, fontSize: 11, color: colors.muted },
});
