// walkFellas — Brutalist Mobile theme
export const theme = {
  color: {
    surface: '#FFFFFF',
    onSurface: '#0A0A0A',
    surfaceSecondary: '#F4F4F4',
    onSurfaceSecondary: '#1A1A1A',
    surfaceTertiary: '#E6E6E6',
    onSurfaceTertiary: '#333333',
    surfaceInverse: '#0A0A0A',
    onSurfaceInverse: '#FFFFFF',
    brand: '#E63946',
    onBrand: '#FFFFFF',
    brandTertiary: '#FADBD8',
    success: '#2A9D8F',
    onSuccess: '#FFFFFF',
    warning: '#E9C46A',
    onWarning: '#0A0A0A',
    error: '#E63946',
    onError: '#FFFFFF',
    info: '#457B9D',
    border: '#CCCCCC',
    borderStrong: '#0A0A0A',
    divider: '#E6E6E6',
    muted: '#666666',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: 0,
  border: {
    hairline: 1,
    hard: 2,
    heavy: 3,
  },
  font: {
    display: 'System',
    body: 'System',
    mono: 'Courier',
  },
  size: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 },
} as const;

export type Theme = typeof theme;
