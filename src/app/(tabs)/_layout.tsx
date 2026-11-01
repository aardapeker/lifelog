import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Active tab = white circle with a dark icon, like the reference's floating bar
const icon = (name: IconName, label: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return (
      <View
        accessibilityLabel={label}
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? colors.accent : 'transparent',
        }}
      >
        <Ionicons name={name} size={21} color={focused ? colors.accentText : colors.text} />
      </View>
    );
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const barWidth = Math.min(240, width - 40);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          position: 'absolute',
          left: (width - barWidth) / 2,
          width: barWidth,
          bottom: insets.bottom + 14,
          height: 62,
          paddingBottom: 0,
          paddingTop: 0,
          borderRadius: 31,
          borderTopWidth: 0,
          backgroundColor: colors.raised,
          elevation: 8,
        },
        tabBarItemStyle: { height: 62, alignItems: 'center', justifyContent: 'center' },
        tabBarIconStyle: { width: 46, height: 46 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journal', tabBarIcon: icon('book-outline', 'Journal') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('chatbubble-outline', 'Chat') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('person-outline', 'Settings') }} />
    </Tabs>
  );
}
