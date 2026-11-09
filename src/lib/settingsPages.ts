/** The settings, split into pages (opened from You). icon + tint: the row's icon tile. */
export const SETTINGS_PAGES = {
  me: { title: 'Me', icon: 'person-outline', tint: '#7FB2FF', hint: "About you · What I've learned · Writing · Icons" },
  ai: { title: 'AI & Usage', icon: 'sparkles-outline', tint: '#C79BFF', hint: 'Models · API keys · Usage · Budget' },
  friend: { title: 'Friend', icon: 'chatbubbles-outline', tint: '#FFC46B', hint: 'Check-ins · Days off · Looking things up' },
  music: { title: 'Music', icon: 'musical-notes-outline', tint: '#6EDC9A', hint: 'Spotify · Radio · Hearted and banned songs' },
  privacy: { title: 'Privacy & Data', icon: 'shield-checkmark-outline', tint: '#FF8A80', hint: 'Lock · Backup · Memory · Widget · Export' },
} as const;
export type SettingsPage = keyof typeof SETTINGS_PAGES;
