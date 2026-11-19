import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import {
  afterTyping,
  applySlash,
  indent,
  insertDivider,
  kindAt,
  parseLine,
  SLASH_BLOCKS,
  slashAt,
  turnInto,
  type LineKind,
} from '../lib/markdown';
import { colors, fonts, inputColors, radius } from '../lib/theme';
import Ionicons from './Icon';

/*
 * The journal's Notion-like editor, in two parts that share one controller:
 * - MarkdownInput: one text box that styles itself as you type (headings big, done to-dos crossed out;
 *   the # and - marks stay, dimmed). Select and paste work as usual, and it's saved as plain Markdown.
 * - MarkdownToolbar: sits above the keyboard (in the editor's footer, so the keyboard can't hide it):
 *   "turn into" buttons for the cursor's line, indent, a divider, and the "/" menu when one was typed.
 */

/** How each kind of line looks while you write. */
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

export type MarkdownController = ReturnType<typeof useMarkdown>;

/** The editor's state: the text, where the cursor is, and whether the "/" menu is open. */
export function useMarkdown(value: string, onChangeText: (text: string) => void) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const cursor = useRef(0);
  const [kind, setKind] = useState<LineKind>('text'); // the cursor's line, lit up in the toolbar
  const [slash, setSlash] = useState<number | null>(null); // where the lone "/" is, while the menu is open
  const [focused, setFocused] = useState(false);

  /** Sets text the editor changed itself, and puts the cursor where it belongs (after the native text updates). */
  const replace = (text: string, at: number) => {
    onChangeText(text);
    cursor.current = at;
    setKind(kindAt(text, at));
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

  return {
    input,
    value,
    kind,
    slash,
    focused,
    change,
    pick,
    closeSlash: () => setSlash(null),
    turnInto: (marker: string) => {
      const done = turnInto(value, cursor.current, marker);
      replace(done.text, done.cursor);
    },
    divider: () => {
      const done = insertDivider(value, cursor.current);
      replace(done.text, done.cursor);
    },
    indent: (dir: 1 | -1) => {
      const done = indent(value, cursor.current, dir);
      if (done) replace(done.text, done.cursor);
    },
    onSelection: (end: number) => {
      cursor.current = end;
      setKind(kindAt(value, end));
      if (slash !== null && end !== slash + 1) setSlash(null); // moved away from the "/"
    },
    setFocused,
    focus: () => input.current?.focus(),
  };
}

export function MarkdownInput({ editor, placeholder, style }: { editor: MarkdownController; placeholder?: string; style?: StyleProp<TextStyle> }) {
  return (
    <TextInput
      ref={editor.input}
      style={style}
      multiline
      scrollEnabled={false}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      onChangeText={editor.change}
      onSelectionChange={(e) => editor.onSelection(e.nativeEvent.selection.end)}
      onFocus={() => editor.setFocused(true)}
      onBlur={() => {
        editor.setFocused(false);
        editor.closeSlash();
      }}
      textAlignVertical="top"
      {...inputColors}
    >
      <Styled text={editor.value} />
    </TextInput>
  );
}

/** The toolbar's "turn into" buttons: what they show and the marker they put on the line. */
const TURN_INTO: { kinds: LineKind[]; marker: string; label?: string; icon?: string; name: string }[] = [
  { kinds: ['text'], marker: '', label: 'Aa', name: 'Text' },
  { kinds: ['h1'], marker: '# ', label: 'H1', name: 'Heading' },
  { kinds: ['h2'], marker: '## ', label: 'H2', name: 'Subheading' },
  { kinds: ['h3'], marker: '### ', label: 'H3', name: 'Small heading' },
  { kinds: ['todo', 'done'], marker: '- [ ] ', icon: 'checkbox-outline', name: 'To-do' },
  { kinds: ['bullet'], marker: '- ', icon: 'list', name: 'Bullets' },
  { kinds: ['number'], marker: '1. ', label: '1.', name: 'Numbers' },
  { kinds: ['quote'], marker: '> ', icon: 'chatbox-ellipses-outline', name: 'Quote' },
];

export function MarkdownToolbar({ editor }: { editor: MarkdownController }) {
  if (editor.slash !== null)
    return (
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {SLASH_BLOCKS.map((b) => (
          <Pressable key={b.label} style={styles.chip} onPress={() => editor.pick(b.marker)} accessibilityLabel={`Insert ${b.label}`}>
            <Text style={styles.chipMark}>{b.marker.trim() || '¶'}</Text>
            <Text style={styles.chipText}>{b.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  if (!editor.focused) return null;
  const list = ['bullet', 'number', 'todo', 'done'].includes(editor.kind);
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {TURN_INTO.map((t) => {
        const on = t.kinds.includes(editor.kind);
        return (
          <Pressable
            key={t.name}
            style={[styles.tool, on && styles.toolOn]}
            onPress={() => editor.turnInto(t.marker)}
            accessibilityLabel={`Turn into ${t.name}`}
            accessibilityState={{ selected: on }}
          >
            {t.icon ? (
              <Ionicons name={t.icon as never} size={19} color={on ? colors.accentText : colors.text} />
            ) : (
              <Text style={[styles.toolText, on && { color: colors.accentText }]}>{t.label}</Text>
            )}
          </Pressable>
        );
      })}
      <View style={styles.sep} />
      <Pressable style={styles.tool} onPress={editor.divider} accessibilityLabel="Insert a divider">
        <Ionicons name="remove-outline" size={22} color={colors.text} />
      </Pressable>
      {list && (
        <>
          <Pressable style={styles.tool} onPress={() => editor.indent(-1)} accessibilityLabel="Move out">
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </Pressable>
          <Pressable style={styles.tool} onPress={() => editor.indent(1)} accessibilityLabel="Move in">
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  marker: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 14 },
  row: { gap: 8, paddingBottom: 10, alignItems: 'center' },
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
  tool: { minWidth: 42, height: 38, paddingHorizontal: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  toolOn: { backgroundColor: colors.text },
  toolText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  sep: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 2 },
});
