import type { ComponentProps } from 'react';
import { View } from 'react-native';
import Ionicons from './Icon';

/** An icon in a soft tinted rounded square (settings rows, the inbox, usage): the polished look instead of emojis. */
export function IconTile({ icon, tint, size = 40 }: { icon: ComponentProps<typeof Ionicons>['name']; tint: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: `${tint}26`, // the tint at ~15%
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.5} color={tint} />
    </View>
  );
}
