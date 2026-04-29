import { useEffect } from 'react';

export type ThemePreference = 'auto' | 'light' | 'dark';
const THEME_PREF_KEY = 'cnvs_theme_preference_v1';

interface UseThemeTimeOptions {
  forceAutoOnOpen?: boolean;
}

function applyTheme(pref: ThemePreference) {
  if (pref === 'light') {
    document.documentElement.classList.remove('dark');
    return;
  }
  if (pref === 'dark') {
    document.documentElement.classList.add('dark');
    return;
  }
  const hour = new Date().getHours();
  const isDark = hour < 6 || hour >= 18;
  document.documentElement.classList.toggle('dark', isDark);
}

export function getThemePreference(): ThemePreference {
  const raw = (localStorage.getItem(THEME_PREF_KEY) || 'auto') as ThemePreference;
  return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto';
}

export function setThemePreference(pref: ThemePreference) {
  localStorage.setItem(THEME_PREF_KEY, pref);
  applyTheme(pref);
}

export function useThemeTime(options?: UseThemeTimeOptions) {
  useEffect(() => {
    if (options?.forceAutoOnOpen) {
      setThemePreference('auto');
    }

    const update = () => {
      applyTheme(getThemePreference());
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [options?.forceAutoOnOpen]);
}
