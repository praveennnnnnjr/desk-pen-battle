export const colors = {
  bg: '#2B1D14', // dark walnut
  bgDeep: '#1E140E',
  surface: '#F6EBDD', // paper / cream
  surfaceMuted: '#E9D9C4',
  ink: '#2A1F1A',
  inkMuted: '#6B5A4E',
  textOnDark: '#F6EBDD',
  textOnDarkMuted: '#C9B8A6',
  accent: '#F0B45A', // brass
  p1: '#2D5BFF', // blue pen
  p2: '#E5484D', // red pen
  success: '#3BA55C',
  danger: '#D64545',
  border: 'rgba(42,31,26,0.15)',
};

export const PLAYER_COLORS = { p1: colors.p1, p2: colors.p2 };

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };

export const spacing = (n) => n * 4;

export const type = {
  title: { fontSize: 30, fontWeight: '900', letterSpacing: 0.5 },
  h2: { fontSize: 20, fontWeight: '800' },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
};
