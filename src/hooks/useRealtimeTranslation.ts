import { useEffect } from 'react';
import { getAppLanguage } from '@/lib/i18n';

declare global {
  interface Window {
    googleTranslateElementInit: () => void;
    google: any;
  }
}

export function useRealtimeTranslation() {
  useEffect(() => {
    // Inject the exact Google Translate script required by browsers
    const initGoogleTranslate = () => {
      if (!document.getElementById('google-translate-script')) {
        const script = document.createElement('script');
        script.id = 'google-translate-script';
        script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        document.body.appendChild(script);

        window.googleTranslateElementInit = () => {
          new window.google.translate.TranslateElement(
            { pageLanguage: 'en', autoDisplay: false },
            'google_translate_element'
          );
        };
        
        // Hide the google translate element but keep it in DOM
        // because we will control it via cookies programmatically
        const div = document.createElement('div');
        div.id = 'google_translate_element';
        div.style.display = 'none';
        document.body.appendChild(div);
      }
    };

    initGoogleTranslate();

    const applyLang = (lang: string) => {
      // Step 1: Set HTML lang
      document.documentElement.lang = lang;
      
      // Step 2: Set the googtrans cookie so Google Translate script auto-translates
      const cookieValue = lang === 'en' ? '/auto/en' : `/en/${lang}`;
      document.cookie = `googtrans=${cookieValue}; path=/`;
      document.cookie = `googtrans=${cookieValue}; domain=${window.location.hostname}; path=/`;
    };

    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<string>).detail || 'en';
      applyLang(next);
      // Reload so the Google Translate script initializes with the new cookie
      window.location.reload();
    };

    applyLang(getAppLanguage());

    window.addEventListener('cnvs-language-change', onLanguageChange);

    return () => {
      window.removeEventListener('cnvs-language-change', onLanguageChange);
    };
  }, []);
}
