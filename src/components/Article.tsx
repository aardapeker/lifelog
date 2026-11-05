import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../lib/theme';

/*
 * The magazine look shared by Reads and "Looked Into" pages:
 * serif headline, italic hook, body text, sources, the Google searches behind it.
 */

export const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

export const paragraphs = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Numbered sources, each opens in the browser. */
export function SourceList({ sources }: { sources: { title: string; uri: string }[] }) {
  if (!sources.length) return null;
  return (
    <View style={articleStyles.sources}>
      <Text style={articleStyles.boxTitle}>Sources</Text>
      {sources.map((s, i) => (
        <Pressable key={s.uri} style={articleStyles.source} onPress={() => openUrl(s.uri)}>
          <Text style={articleStyles.sourceNum}>{i + 1}</Text>
          <Text style={articleStyles.sourceText} numberOfLines={1}>
            {s.title}
          </Text>
          <Ionicons name="open-outline" size={14} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/** The searches that were run (Google asks apps to show them), plus the AI disclaimer. */
export function SearchedFor({ queries }: { queries: string[] }) {
  if (!queries.length) return null;
  return (
    <View style={articleStyles.queries}>
      <Text style={articleStyles.small}>Searched on Google</Text>
      <View style={articleStyles.queryRow}>
        {queries.map((q) => (
          <Pressable
            key={q}
            style={articleStyles.query}
            onPress={() => openUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`)}
          >
            <Ionicons name="search" size={12} color={colors.muted} />
            <Text style={articleStyles.queryText}>{q}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={articleStyles.small}>Written by AI from these sources. Check them for anything important.</Text>
    </View>
  );
}

export const articleStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { paddingHorizontal: 24, paddingTop: 28 },

  title: { fontFamily: fonts.serif, fontSize: 38, lineHeight: 44, color: colors.text, letterSpacing: -0.5 },
  hook: { fontFamily: fonts.serifItalic, fontSize: 19, lineHeight: 29, color: colors.muted, marginTop: 14 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22, marginBottom: 10 },

  section: { marginTop: 26 },
  heading: { fontFamily: fonts.serif, fontSize: 23, lineHeight: 30, color: colors.text, marginBottom: 10 },
  body: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 29, color: '#E8E6E3', marginBottom: 14 },

  news: { marginTop: 18, backgroundColor: colors.raised, borderRadius: radius.md, padding: 18, gap: 10 },
  boxTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.text, marginBottom: 4 },
  newsRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text, marginTop: 9 },
  newsText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 23, color: colors.text },

  forYou: { marginTop: 18, backgroundColor: colors.accent, borderRadius: radius.md, padding: 20 },
  forYouTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.accentText, marginBottom: 8 },
  forYouText: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 26, color: colors.accentText },

  sources: { marginTop: 32 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sourceNum: { width: 18, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  sourceText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, color: colors.text },

  queries: { marginTop: 22, gap: 8 },
  queryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  query: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  queryText: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.text },
  small: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.muted },
});
