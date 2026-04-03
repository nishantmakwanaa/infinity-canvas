import { useEffect } from 'react';

export function useThemeTime() {
  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours();
      const isDark = hour < 6 || hour >= 18;
      document.documentElement.classList.toggle('dark', isDark);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);
}
