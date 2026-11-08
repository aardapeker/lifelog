// Monochrome editorial: charcoal, white, one grey. Libre Caslon for voice, Inter for UI.
export const colors = {
  bg: '#1D1C1C',
  surface: '#272626', // cards, panels
  raised: '#333232', // inputs, chips, tab bar
  line: '#3D3C3C',
  text: '#FFFFFF',
  muted: '#999898',
  accent: '#FFFFFF', // primary buttons are white pills
  accentText: '#1D1C1C',
  danger: '#FF8A80',
  ok: '#9AD8AE',
};

// One family, Inter, everywhere (the mini player's look). The "serif" names stay as the roles
// they always had (reading text, its italic, its bold) so nothing else had to change.
export const fonts = {
  display: 'Inter_600SemiBold', // big titles, set a little tighter
  serif: 'Inter_400Regular',
  serifItalic: 'Inter_400Regular_Italic',
  serifBold: 'Inter_700Bold',
  sans: 'Inter_500Medium',
  sansRegular: 'Inter_400Regular',
  sansBold: 'Inter_600SemiBold',
};

/** Text fields: a soft highlight so selected text stays readable, white handles and cursor. */
export const inputColors = {
  selectionColor: 'rgba(255, 255, 255, 0.3)',
  selectionHandleColor: '#FFFFFF',
  cursorColor: '#FFFFFF',
} as const;

export const radius = { sm: 12, md: 20, lg: 28, pill: 999 };

/** Space the floating tab bar needs at the bottom of every tab screen. */
export const TAB_BAR_SPACE = 110;
