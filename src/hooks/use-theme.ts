import { Colors } from '@/constants/theme';

/**
 * The Firefly design is light-only (app.json sets userInterfaceStyle "light").
 * `Colors.dark` is kept in theme.ts so a dark mode can be switched back on here later.
 */
export function useTheme() {
  return Colors.light;
}
