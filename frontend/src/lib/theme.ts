// walkFellas — Friendly Modern theme (Montserrat, rounded, soft shadows)
import { Platform } from 'react-native';

export const theme = {
  color: {
    surface: '#FFFFFF',
    onSurface: '#1A1A1F',
    surfaceSecondary: '#F6F6F8',
    onSurfaceSecondary: '#2A2A31',
    surfaceTertiary: '#EDEDF1',
    onSurfaceTertiary: '#4A4A55',
    surfaceInverse: '#1A1A1F',
    onSurfaceInverse: '#FFFFFF',

    brand: '#E63946',
    brandDeep: '#C42836',
    brandSoft: '#FDECEC',
    onBrand: '#FFFFFF',
    brandTertiary: '#FADBD8',
    onBrandTertiary: '#C42836',

    accent: '#F4A261',
    accentSoft: '#FEF3EC',

    success: '#2A9D8F',
    successSoft: '#E3F4F1',
    onSuccess: '#FFFFFF',
    warning: '#E9C46A',
    warningSoft: '#FBF5DF',
    onWarning: '#1A1A1F',
    error: '#E63946',
    onError: '#FFFFFF',
    info: '#457B9D',
    infoSoft: '#E4EDF3',

    border: '#E4E4EA',
    borderStrong: '#1A1A1F',
    divider: '#EFEFF3',
    muted: '#8A8A93',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, pill: 999 },
  border: { hairline: 1, hard: 1.5 },
  shadow: {
    sm: Platform.select({
      ios: { shadowColor: '#1A1A1F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
      default: {},
    }),
    md: Platform.select({
      ios: { shadowColor: '#1A1A1F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 4 },
      default: {},
    }),
    lg: Platform.select({
      ios: { shadowColor: '#1A1A1F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  font: {
    regular: 'Montserrat-Regular',
    medium: 'Montserrat-Medium',
    semibold: 'Montserrat-SemiBold',
    bold: 'Montserrat-Bold',
    extrabold: 'Montserrat-ExtraBold',
    black: 'Montserrat-Black',
    mono: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }) as string,
  },
  size: { xs: 11, sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 44 },
} as const;

export type Theme = typeof theme;
