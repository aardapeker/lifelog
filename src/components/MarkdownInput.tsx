import { forwardRef, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { afterTyping, applySlash, parseLine, SLASH_BLOCKS, slashAt, type LineKind } from '../lib/markdown';
import { colors, fonts, inputColors, radius } from '../lib/theme';

/** How each kind of line looks while you write (the markers stay, dimmed). */
const LINE: Partial<Record<LineKind, TextStyle>> = {
  h1: { fontFamily: fonts.display, fontSize: 23, lineHeight: 34 },
  h2: { fontFamily: fonts.display, fontSize: 20, lineHeight: 30 },
  h3: { fontFamily: fonts.sansBold, fontSize: 17 },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  quote: { fontFamily: fonts.serifItalic, color: colors.muted },
  divider: { color: colors.muted },
};

/** The text, styled line by line: the input shows these instead of a plain string. */
function Styled({ text }: { text: string }) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const { kind, marker, rest } = parseLine(line);
    const end = i < lines.length - 1 ? '\n' : '';
    if (kind === 'text') return <Text key={i}>{line + end}</Text>;
    return (
      <Text key={i} style={LINE[kind]}>
        <Text style={styles.marker}>{marker}</Text>
        {rest + end}
      </Text>
    );
  });
}

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * The journal's text box with the basics of a Notion-like editor, still one box (select and paste work as usual):
 * headings, lists and to-dos are styled as you type, Enter continues a list, and "/" on an empty line opens a
 * menu of blocks. What's saved is plain Markdown.
 */
export const MarkdownInput = forwardRef<{ focus: () => void }, Props>(function MarkdownInput({ value, onChangeText, placeholder, style }, ref) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const cursor = useRef(0);
  const [slash, setSlash] = useState<number | null>(null); // where the lone "/" is, while the menu is open
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  /** Sets text the editor changed itself, and puts the cursor where it belongs (after the native text updates). */
  const replace = (text: string, at: number) => {
    onChangeText(text);
    cursor.current = at;
    setTimeout(() => input.current?.setSelection(at, at), 0);
  };

  const change = (next: string) => {
    const fix = afterTyping(value, next);
    if (fix) {
      setSlash(null);
      return replace(fix.text, fix.cursor);
    }
    onChangeText(next);
    // the "/" menu: open right after a lone "/" was typed (the cursor moves after the text changes)
    const typedAt = next.length === value.length + 1 ? [...next].findIndex((c, k) => c !== value[k]) : -1;
    setSlash(typedAt >= 0 ? slashAt(next, typedAt + 1) : null);
  };

  const pick = (marker: string) => {
    if (slash === null) return;
    const done = applySlash(value, slash, marker);
    setSlash(null);
    replace(done.text, done.cursor);
  };

  return (
    <View>
      <TextInput
        ref={input}
        style={style}
        multiline
        scrollEnabled={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        onChangeText={change}
        onSelectionChange={(e) => {
          cursor.current = e.nativeEvent.selection.end;
          if (slash !== null && cursor.current !== slash + 1) setSlash(null); // moved away from the "/"
        }}
        onBlur={() => setSlash(null)}
        textAlignVertical="top"
        {...inputColors}
      >
        <Styled text={value} />
      </TextInput>
      {slash !== null && (
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={styles.menu} contentContainerStyle={styles.menuRow}>
          {SLASH_BLOCKS.map((b) => (
            <Pressable key={b.label} style={styles.chip} onPress={() => pick(b.marker)} accessibilityLabel={`Insert ${b.label}`}>
              <Text style={styles.chipMark}>{b.marker.trim() || '¶'}</Text>
              <Text style={styles.chipText}>{b.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  marker: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 14 },
  menu: { marginTop: 8, flexGrow: 0 },
  menuRow: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipMark: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
  chipText: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
});
