import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../lib/theme';

// a link ends before trailing punctuation: "see https://x.com/a." → https://x.com/a
const URL = /(https?:\/\/[^\s)]*[^\s).,!?;:'"])/g;

/** Text where every http(s) link is tappable. Used for the friend's messages. */
export function LinkedText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const parts = text.split(URL);
  return (
    <Text selectable style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text
            key={i}
            style={{ textDecorationLine: 'underline', color: colors.text }}
            onPress={() => Linking.openURL(part).catch(() => {})}
          >
            {part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
            {part.replace(/^https?:\/\/(www\.)?/, '').length > 40 ? '…' : ''}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
