import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../lib/theme';

/*
 * Code on a dark editor panel with line numbers and simple syntax colours (keywords, strings,
 * numbers, comments), like a tiny VS Code. In a bug hunt every line is tappable; the blank of a
 * fill-the-blank question (___) glows until it's filled.
 */

const KEYWORDS = new Set(
  (
    'const let var function return if else for while do switch case default break continue new class extends super this ' +
    'import export from async await yield try catch finally throw typeof instanceof in of void delete null undefined true ' +
    'false NaN interface type enum implements keyof readonly as satisfies never unknown any number string boolean public ' +
    'private protected static final abstract int long double float char byte short record var throws package void'
  ).split(' '),
);
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?[nLfd]?\b)|(___)|([A-Za-z_$][\w$]*)|(\s+|.)/gm;

const C = {
  text: '#E6EDF3',
  keyword: '#FF7B72',
  string: '#A5D6FF',
  number: '#79C0FF',
  comment: '#8B949E',
  type: '#FFA657', // Capitalised names: classes and types
  call: '#D2A8FF',
  blank: '#F7DF1E',
};

function Line({ text, fill }: { text: string; fill?: string | null }) {
  const parts: { t: string; c: string; blank?: boolean }[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const [t, comment, str, num, blank, word] = m;
    if (comment) parts.push({ t, c: C.comment });
    else if (str) parts.push({ t, c: C.string });
    else if (num) parts.push({ t, c: C.number });
    else if (blank) parts.push({ t: fill ?? ' ? ', c: C.blank, blank: true });
    else if (word) {
      const next = text.slice((m.index ?? 0) + t.length).trimStart()[0];
      parts.push({ t, c: KEYWORDS.has(t) ? C.keyword : /^[A-Z]/.test(t) ? C.type : next === '(' ? C.call : C.text });
    } else parts.push({ t, c: C.text });
  }
  return (
    <Text style={styles.code}>
      {parts.map((p, i) => (
        <Text key={i} style={[{ color: p.c }, p.blank && styles.blank]}>
          {p.t}
        </Text>
      ))}
    </Text>
  );
}

export function CodeBlock({
  code,
  fill,
  onLine,
  picked,
  right,
}: {
  code: string;
  fill?: string | null; // what fills the ___
  onLine?: (i: number) => void; // bug hunt: tap a line
  picked?: number | null; // the line you tapped
  right?: number | null; // the broken line, shown after you answer
}) {
  const lines = code.split('\n');
  return (
    <View style={styles.panel}>
      <View style={styles.dots}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
          <View key={c} style={[styles.dot, { backgroundColor: c }]} />
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flexGrow: 1 }}>
          {lines.map((l, i) => {
            const mark = right === i ? styles.lineRight : picked === i ? (right == null ? styles.linePicked : styles.lineWrong) : null;
            const row = (
              <View style={[styles.row, onLine && styles.rowTap, mark]}>
                <Text style={styles.num}>{i + 1}</Text>
                <Line text={l || ' '} fill={fill} />
              </View>
            );
            return onLine ? (
              <Pressable key={i} onPress={() => onLine(i)} accessibilityLabel={`Line ${i + 1}: ${l}`}>
                {row}
              </Pressable>
            ) : (
              <View key={i}>{row}</View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#0D1117', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingBottom: 10, overflow: 'hidden' },
  dots: { flexDirection: 'row', gap: 6, padding: 12, paddingBottom: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 14, paddingVertical: 1 },
  rowTap: { paddingVertical: 5 },
  linePicked: { backgroundColor: 'rgba(121,192,255,0.16)' },
  lineWrong: { backgroundColor: 'rgba(255,123,114,0.22)' },
  lineRight: { backgroundColor: 'rgba(86,211,100,0.22)' },
  num: { fontFamily: fonts.mono, fontSize: 12, color: '#484F58', width: 30, textAlign: 'right', marginRight: 12 },
  // no ligatures: => stays => (you're learning what to type, not a pretty arrow)
  code: { fontFamily: fonts.mono, fontSize: 13.5, lineHeight: 21, fontVariant: ['no-contextual', 'no-common-ligatures'] },
  blank: { backgroundColor: 'rgba(247,223,30,0.14)', fontFamily: fonts.monoBold },
});
