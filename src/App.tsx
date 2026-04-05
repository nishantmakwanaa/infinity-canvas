import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SharePreviewRedirect from "./pages/SharePreviewRedirect";
import { useRealtimeTranslation } from "@/hooks/useRealtimeTranslation";
import { setThemePreference, useThemeTime } from "@/hooks/useThemeTime";
import { useCanvasStore } from "@/store/canvasStore";
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
      const hasCtrlAltOnly = e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey;
      if (!hasCtrlAltOnly) return;

      if (e.code === 'Digit7') {
        e.preventDefault();
        setThemePreference('light');
        toast.success('Theme mode changed to Light', { description: 'Shortcut: Ctrl + Alt + 7' });
        return;
      }

      if (e.code === 'Digit8') {
        e.preventDefault();
        setThemePreference('dark');
        toast.success('Theme mode changed to Dark', { description: 'Shortcut: Ctrl + Alt + 8' });
        return;
      }

      if (e.code === 'Digit9') {
        e.preventDefault();
        setThemePreference('auto');
        toast.success('Theme mode changed to Auto', { description: 'Shortcut: Ctrl + Alt + 9' });
      }
    };

    window.addEventListener('keydown', onThemeShortcut, true);
    return () => window.removeEventListener('keydown', onThemeShortcut, true);
  }, []);

  useEffect(() => {
    const embedZoomClass = 'cnvs-zoom-through-embeds';
    const setEmbedZoomThrough = (active: boolean, target?: EventTarget | null) => {
      const canvases = new Set<HTMLElement>();

      if (target instanceof Element) {
        const nearestCanvas = target.closest('[data-canvas="true"]') as HTMLElement | null;
        if (nearestCanvas) {
          canvases.add(nearestCanvas);
        }
      }

      if (!canvases.size) {
        document.querySelectorAll<HTMLElement>('[data-canvas="true"]').forEach((canvas) => {
          canvases.add(canvas);
        });
      }

      canvases.forEach((canvas) => {
        canvas.classList.toggle(embedZoomClass, active);
      });

      // Ensure no stale legacy global class remains on the document root.
      document.documentElement.classList.remove(embedZoomClass);
    };
    const isCanvasTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('[data-canvas="true"]'));
    };
    let wheelZoomResetTimer: number | null = null;

    const scheduleEmbedZoomReset = () => {
      if (wheelZoomResetTimer !== null) {
        window.clearTimeout(wheelZoomResetTimer);
      }
      wheelZoomResetTimer = window.setTimeout(() => {
        setEmbedZoomThrough(false);
        wheelZoomResetTimer = null;
      }, 140);
    };

    const onWheelPreventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        if (isCanvasTarget(e.target)) {
          setEmbedZoomThrough(true, e.target);
          scheduleEmbedZoomReset();
          return;
        }

        const state = useCanvasStore.getState();
        const delta = -e.deltaY * 0.002;
        state.setZoom(state.zoom * (1 + delta));
      }
    };

    const onKeyDownPreventBrowserZoom = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0') {
        e.preventDefault();
        const state = useCanvasStore.getState();
        if (e.key === '0') {
          state.setZoom(1);
          return;
        }
        if (e.key === '+' || e.key === '=') {
          state.setZoom(state.zoom * 1.12);
          return;
        }
        if (e.key === '-' || e.key === '_') {
          state.setZoom(state.zoom / 1.12);
        }
      }
    };

    const onGestureStart = (e: Event) => {
      setEmbedZoomThrough(true, e.target);
      e.preventDefault();
    };

    const onGesture = (e: Event) => {
      e.preventDefault();
    };

    const onGestureEnd = () => {
      setEmbedZoomThrough(false);
    };

    const onZoomModifierDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.key === 'Control' || e.key === 'Meta') {
        setEmbedZoomThrough(true);
      }
    };

    const onZoomModifierUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setEmbedZoomThrough(false);
      }
    };

    const onWindowBlur = () => {
      setEmbedZoomThrough(false);
    };

    window.addEventListener('wheel', onWheelPreventBrowserZoom, { passive: false, capture: true });
    window.addEventListener('keydown', onZoomModifierDown, true);
    window.addEventListener('keyup', onZoomModifierUp, true);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKeyDownPreventBrowserZoom, true);
    document.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false });
    document.addEventListener('gesturechange', onGesture as EventListener, { passive: false });
    document.addEventListener('gestureend', onGestureEnd as EventListener);

    return () => {
      setEmbedZoomThrough(false);
      if (wheelZoomResetTimer !== null) {
        window.clearTimeout(wheelZoomResetTimer);
      }
      window.removeEventListener('wheel', onWheelPreventBrowserZoom, true);
      window.removeEventListener('keydown', onZoomModifierDown, true);
      window.removeEventListener('keyup', onZoomModifierUp, true);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKeyDownPreventBrowserZoom, true);
      document.removeEventListener('gesturestart', onGestureStart as EventListener);
      document.removeEventListener('gesturechange', onGesture as EventListener);
      document.removeEventListener('gestureend', onGestureEnd as EventListener);
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
            <Route path="/api/share-preview" element={<SharePreviewRedirect />} />
            <Route path="/:pageToken" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
