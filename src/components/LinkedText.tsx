import { router } from 'expo-router';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../lib/theme';

// a link ends before trailing punctuation: "see https://x.com/a." → https://x.com/a
const URL = /((?:https?|lifelog):\/\/[^\s)]*[^\s).,!?;:'"])/g;

const label = (url: string) => {
  if (url.startsWith('lifelog://read/')) return '📖 Open the read';
  const bare = url.replace(/^https?:\/\/(www\.)?/, '');
  return bare.length > 40 ? `${bare.slice(0, 40)}…` : bare;
};

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
            onPress={() =>
              part.startsWith('lifelog://')
                ? router.push(`/${part.slice('lifelog://'.length)}` as never)
                : Linking.openURL(part).catch(() => {})
            }
          >
            {label(part)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
