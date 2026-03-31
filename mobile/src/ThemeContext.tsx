import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { AppTheme } from './theme';
import { darkTheme, forestTheme, lightTheme, oceanTheme, sunsetTheme } from './theme';

export const THEME_STORAGE_KEY = 'rota_theme_mode';

export type ThemeMode = 'light' | 'dark' | 'ocean' | 'sunset' | 'forest';

const THEMES: Record<ThemeMode, AppTheme> = {
  light: lightTheme,
  dark: darkTheme,
  ocean: oceanTheme,
  sunset: sunsetTheme,
  forest: forestTheme,
};

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'ocean', 'sunset', 'forest'];

function isThemeMode(v: string | null | undefined): v is ThemeMode {
  return v != null && (THEME_MODES as string[]).includes(v);
}

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  theme: AppTheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (!alive) return;
        if (isThemeMode(v)) setModeState(v);
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, m);
  }, []);

  const theme = THEMES[mode] ?? darkTheme;

  const value = useMemo(() => ({ mode, setMode, theme }), [mode, setMode, theme]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode, hydrated]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return darkTheme;
  }
  return ctx.theme;
}

export function useThemeMode(): Pick<ThemeContextValue, 'mode' | 'setMode'> {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { mode: 'dark', setMode: () => {} };
  }
  return { mode: ctx.mode, setMode: ctx.setMode };
}
