import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useRealtimeTranslation } from "@/hooks/useRealtimeTranslation";
import { setThemePreference, useThemeTime } from "@/hooks/useThemeTime";
import { useEffect } from "react";
import { toast } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  useRealtimeTranslation();
  useThemeTime({ forceAutoOnOpen: true });

  useEffect(() => {
    const onThemeShortcut = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const hasCtrlShiftOnly = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
      if (!hasCtrlShiftOnly) return;

      if (e.code === 'Digit7') {
        e.preventDefault();
        setThemePreference('light');
        toast.success('Theme mode changed to Light', { description: 'Shortcut: Ctrl + Shift + 7' });
        return;
      }

      if (e.code === 'Digit8') {
        e.preventDefault();
        setThemePreference('dark');
        toast.success('Theme mode changed to Dark', { description: 'Shortcut: Ctrl + Shift + 8' });
        return;
      }

      if (e.code === 'Digit9') {
        e.preventDefault();
        setThemePreference('auto');
        toast.success('Theme mode changed to Auto', { description: 'Shortcut: Ctrl + Shift + 9' });
      }
    };

    window.addEventListener('keydown', onThemeShortcut, true);
    return () => window.removeEventListener('keydown', onThemeShortcut, true);
  }, []);

  useEffect(() => {
    const onWheelPreventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const onKeyDownPreventBrowserZoom = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0') {
        e.preventDefault();
      }
    };

    const onGesture = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('wheel', onWheelPreventBrowserZoom, { passive: false, capture: true });
    window.addEventListener('keydown', onKeyDownPreventBrowserZoom, true);
    document.addEventListener('gesturestart', onGesture as EventListener, { passive: false });
    document.addEventListener('gesturechange', onGesture as EventListener, { passive: false });

    return () => {
      window.removeEventListener('wheel', onWheelPreventBrowserZoom, true);
      window.removeEventListener('keydown', onKeyDownPreventBrowserZoom, true);
      document.removeEventListener('gesturestart', onGesture as EventListener);
      document.removeEventListener('gesturechange', onGesture as EventListener);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner position="bottom-right" />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/:pageToken" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
