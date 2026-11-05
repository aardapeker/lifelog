import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts } from '../lib/theme';

// a link ends before trailing punctuation: "see https://x.com/a." → https://x.com/a
const URL = /((?:https?|lifelog):\/\/[^\s)]*[^\s).,!?;:'"])/g;
// **bold**, *italic*, `code` (underscores are left alone: they show up in names and file paths)
const INLINE = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*|`[^`\n]+`)/g;

const label = (url: string) => {
  if (url.startsWith('lifelog://read/')) return '📖 Open the read';
  const bare = url.replace(/^https?:\/\/(www\.)?/, '');
  return bare.length > 40 ? `${bare.slice(0, 40)}…` : bare;
};

/** Line-level markdown the models like to use: bullets and headings. */
const blocks = (text: string) =>
  text
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, '**$1**');

/** The bold / italic version of whatever font the message is set in. */
function variants(style: StyleProp<TextStyle>): { bold: TextStyle; italic: TextStyle } {
  const family = StyleSheet.flatten(style)?.fontFamily ?? fonts.serif;
  return family.startsWith('LibreCaslon')
    ? { bold: { fontFamily: fonts.serifBold }, italic: { fontFamily: fonts.serifItalic } }
    : { bold: { fontFamily: fonts.sansBold }, italic: { fontStyle: 'italic' } };
}

function inline(text: string, key: string, v: ReturnType<typeof variants>): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    const k = `${key}.${i}`;
    if (part.startsWith('**')) return <Text key={k} style={v.bold}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('`')) return <Text key={k} style={styles.code}>{part.slice(1, -1)}</Text>;
    return <Text key={k} style={v.italic}>{part.slice(1, -1)}</Text>;
  });
}

/** The friend's messages: light markdown (bold, italic, code, bullets) and tappable links. */
export function LinkedText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const v = variants(style);
  const parts = blocks(text).split(URL);
  return (
    <Text selectable style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text
            key={i}
            style={{ textDecorationLine: 'underline', color: colors.text }}
            onPress={() =>
              part.startsWith('lifelog://')
                ? router.push(`/${part.slice('lifelog://'.length)}` as never)
                : Linking.openURL(part).catch(() => {})
            }
          >
            {label(part)}
          </Text>
        ) : (
          inline(part, String(i), v)
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: 'monospace', fontSize: 15, backgroundColor: colors.raised },
});
