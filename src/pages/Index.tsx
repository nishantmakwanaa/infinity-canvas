import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { AppHeader } from '@/components/canvas/AppHeader';
import { ToolSettingsPanel } from '@/components/canvas/ToolSettingsPanel';
import { CanvasSidebar } from '@/components/canvas/CanvasSidebar';
import { useThemeTime } from '@/hooks/useThemeTime';
import { useAuth } from '@/hooks/useAuth';
import { useCanvasSync } from '@/hooks/useCanvasSync';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCanvasStore } from '@/store/canvasStore';

function slugifyUsername(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

const Index = () => {
  useThemeTime();
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ username?: string; canvasName?: string }>();
  const { canvases, currentCanvasId, currentCanvasName, createCanvas, selectCanvas, selectCanvasByName, selectCanvasByRoute, deleteCanvases } = useCanvasSync(session, user?.username);
  const [sidebarWidthPercent, setSidebarWidthPercent] = useState(18);
  const initialRouteSyncedRef = useRef(false);

  const isLoggedIn = Boolean(session?.user?.id);

  useEffect(() => {
    if (!session?.user?.id || !params.canvasName || initialRouteSyncedRef.current) return;
    const decodedName = decodeURIComponent(params.canvasName);
    if (decodedName && decodedName !== currentCanvasName) {
      initialRouteSyncedRef.current = true;
      if (params.username) {
        selectCanvasByRoute(params.username, decodedName);
      } else {
        selectCanvasByName(decodedName);
      }
    }
  }, [session?.user?.id, params.canvasName, params.username, currentCanvasName, selectCanvasByName, selectCanvasByRoute]);

  useEffect(() => {
    if (!user || !currentCanvasName) return;
    const desired = `/${slugifyUsername(user.username)}/${encodeURIComponent(currentCanvasName)}`;
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    const desiredPath = desired.replace(/\/+$/, '') || '/';
    if (currentPath !== desiredPath) {
      navigate(desired, { replace: true });
    }
  }, [user, currentCanvasName, navigate]);

  useEffect(() => {
    initialRouteSyncedRef.current = false;
  }, [session?.user?.id]);

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const pct = (ev.clientX / window.innerWidth) * 100;
      setSidebarWidthPercent(Math.max(10, Math.min(30, pct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable;
      if (isTyping) return;

      const key = e.key.toLowerCase();
      const store = useCanvasStore.getState();

      if (key === 'n') { e.preventDefault(); store.addBlock('note'); return; }
      if (key === 'l') { e.preventDefault(); store.addBlock('link'); return; }
      if (key === 't') { e.preventDefault(); store.addBlock('todo'); return; }
      if (key === 'm') { e.preventDefault(); store.addBlock('media'); return; }

      if (key === 'v') { e.preventDefault(); store.setActiveTool('select'); return; }
      if (key === 'p') { e.preventDefault(); store.setActiveTool('pencil'); return; }
      if (key === 'e') { e.preventDefault(); store.setActiveTool('eraser'); return; }
      if (key === 'x') { e.preventDefault(); store.setActiveTool('text'); return; }
      if (key === 's') { e.preventDefault(); store.setActiveTool('shape'); return; }
      if (key === 'a') { e.preventDefault(); store.setActiveTool('arrow'); return; }

      // Use Ctrl + / Ctrl - already handled by browser zoom; keep for canvas zoom too.
      if (key === '+' || key === '=') { e.preventDefault(); store.setZoom(store.zoom * 1.15); return; }
      if (key === '-') { e.preventDefault(); store.setZoom(store.zoom / 1.15); return; }
      if (key === '0') { e.preventDefault(); store.setZoom(1); store.setPan({ x: 0, y: 0 }); return; }
      if (key === 'r') { e.preventDefault(); store.setPan({ x: 0, y: 0 }); store.setZoom(1); return; }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <InfiniteCanvas />
      <AppHeader
        user={user}
        loading={loading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
        currentCanvasId={currentCanvasId}
        currentCanvasName={currentCanvasName}
        leftOffsetPercent={isLoggedIn ? sidebarWidthPercent : 0}
      />
      <CanvasSidebar
        loggedInUserId={session?.user?.id ?? null}
        canvases={canvases}
        currentCanvasId={currentCanvasId}
        onCreateCanvas={() => createCanvas()}
        onSelectCanvas={(id) => selectCanvas(id)}
        onDeleteCanvases={(ids) => deleteCanvases(ids)}
        widthPercent={sidebarWidthPercent}
        onResizeStart={handleSidebarResizeStart}
      />
      <Toolbar />
      <ToolSettingsPanel />
      {/* Made by Nishant */}
      <div className="fixed bottom-3 right-4 z-50 px-3 py-1.5 bg-secondary/60 border border-border select-none pointer-events-none">
        <span className="text-[9px] font-mono text-muted-foreground block leading-tight">made by</span>
        <span className="text-[11px] font-mono font-bold text-foreground block leading-tight">Nishant</span>
      </div>
    </>
  );
};

export default Index;
