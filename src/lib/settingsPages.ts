/** The settings, split into pages (opened from You). */
export const SETTINGS_PAGES = {
  me: { title: 'Me', emoji: '👤', hint: 'About you · What I\'ve learned · Writing' },
  ai: { title: 'AI & Usage', emoji: '🤖', hint: 'Models · API keys · Usage · Budget' },
  friend: { title: 'Friend', emoji: '👋', hint: 'Check-ins · Days off · Looking things up' },
  music: { title: 'Music', emoji: '🎵', hint: 'Spotify · Radio · Hearted and banned songs' },
  privacy: { title: 'Privacy & Data', emoji: '🔒', hint: 'Lock · Backup · Memory · Widget · Export' },
} as const;
export type SettingsPage = keyof typeof SETTINGS_PAGES;
