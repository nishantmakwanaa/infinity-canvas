export type AppLanguage = {
  code: string;
  label: string;
};

const LANGUAGE_KEY = 'cnvs_ui_language_v1';

export const APP_LANGUAGES: AppLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espanol' },
  { code: 'fr', label: 'Francais' },
  { code: 'de', label: 'Deutsch' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portugues' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Russkiy' },
  { code: 'tr', label: 'Turkce' },
];

export function getAppLanguage(): string {
  const saved = localStorage.getItem(LANGUAGE_KEY) || 'en';
  return APP_LANGUAGES.some((lang) => lang.code === saved) ? saved : 'en';
}

export function setAppLanguage(code: string) {
  const normalized = APP_LANGUAGES.some((lang) => lang.code === code) ? code : 'en';
  localStorage.setItem(LANGUAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent('cnvs-language-change', { detail: normalized }));
}
