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
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

const CANVAS_BLOCK_CLIPBOARD_KEY = 'cnvs_block_clipboard_v1';

function slugifyUsername(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

const Index = () => {
  useThemeTime();
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ username?: string; canvasName?: string }>();
  const {
    canvases,
    currentCanvasId,
    currentCanvasName,
    createCanvas,
    selectCanvas,
    selectCanvasByName,
    selectCanvasByRoute,
    deleteCanvases,
    isCanvasLoading,
  } = useCanvasSync(session);
  const [sidebarWidthPercent, setSidebarWidthPercent] = useState(18);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const initialRouteSyncedRef = useRef(false);
  const isMobile = useIsMobile();

  const isLoggedIn = Boolean(session?.user?.id);
  const effectiveSidebarWidthPercent = isMobile ? 70 : sidebarWidthPercent;
  const canvasLeftOffsetPercent = isLoggedIn && isSidebarOpen && !isMobile ? sidebarWidthPercent : 0;
  const showChrome = !isCanvasLoading;

  useEffect(() => {
    if (!session?.user?.id || initialRouteSyncedRef.current) return;

    const routeName = params.canvasName ? decodeURIComponent(params.canvasName) : '';
    initialRouteSyncedRef.current = true;

    if (!routeName) {
      return;
    }

    if (params.username) {
      void selectCanvasByRoute(params.username, routeName);
    } else {
      void selectCanvasByName(routeName);
    }
  }, [session?.user?.id, params.canvasName, params.username, selectCanvasByName, selectCanvasByRoute]);

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

  useEffect(() => {
    if (!isMobile) return;
    setSidebarWidthPercent(70);
  }, [isMobile]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isCanvasLoading) return;
      const hasSupportedModifier = (e.altKey || e.ctrlKey) && !e.metaKey;
      if (!hasSupportedModifier) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable;
      if (isTyping) return;

      const code = e.code;
      const store = useCanvasStore.getState();

      if (code === 'KeyN') { e.preventDefault(); store.addBlock('note'); return; }
      if (code === 'KeyL') { e.preventDefault(); store.addBlock('link'); return; }
      if (code === 'KeyT') { e.preventDefault(); store.addBlock('todo'); return; }
      if (code === 'KeyM') { e.preventDefault(); store.addBlock('media'); return; }

      if (code === 'KeyV') { e.preventDefault(); store.setActiveTool('select'); return; }
      if (code === 'KeyP') { e.preventDefault(); store.setActiveTool('pencil'); return; }
      if (code === 'KeyE') { e.preventDefault(); store.setActiveTool('eraser'); return; }
      if (code === 'KeyX') { e.preventDefault(); store.setActiveTool('text'); return; }
      if (code === 'KeyS') { e.preventDefault(); store.setActiveTool('shape'); return; }
      if (code === 'KeyI') { e.preventDefault(); store.setActiveTool('line'); return; }
      if (code === 'KeyA') { e.preventDefault(); store.setActiveTool('arrow'); return; }
      if (code === 'KeyC') {
        const selected = store.blocks.find((block) => block.id === store.selectedBlockId);
        if (!selected) {
          toast.info('Select a canvas block to copy');
          return;
        }
        const payload = JSON.stringify({ type: 'cnvs-block', block: selected });
        localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, payload);
        void navigator.clipboard.writeText(payload).catch(() => undefined);
        e.preventDefault();
        toast.success('Canvas block copied');
        return;
      }

      if (code === 'Equal') { e.preventDefault(); store.setZoom(store.zoom * 1.15); return; }
      if (code === 'Minus') { e.preventDefault(); store.setZoom(store.zoom / 1.15); return; }
      if (code === 'Digit0') { e.preventDefault(); store.setZoom(1); store.setPan({ x: 0, y: 0 }); return; }
      if (code === 'KeyR') { e.preventDefault(); store.setPan({ x: 0, y: 0 }); store.setZoom(1); return; }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isCanvasLoading]);

  return (
    <>
      <InfiniteCanvas
        leftOffsetPercent={canvasLeftOffsetPercent}
        loading={isCanvasLoading}
      />
      {showChrome && (
        <AppHeader
          user={user}
          loading={loading}
          onSignIn={signInWithGoogle}
          onSignOut={signOut}
          currentCanvasId={currentCanvasId}
          currentCanvasName={currentCanvasName}
          leftOffsetPercent={canvasLeftOffsetPercent}
          showSidebarToggle={isLoggedIn}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
      )}
      {showChrome && isSidebarOpen && (
        <>
          {isMobile && (
            <div
              className="fixed inset-0 z-[55] bg-background/40"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
          <CanvasSidebar
            loggedInUserId={session?.user?.id ?? null}
            canvases={canvases}
            currentCanvasId={currentCanvasId}
            onCreateCanvas={() => createCanvas()}
            onSelectCanvas={(id) => {
              selectCanvas(id);
              if (isMobile) setIsSidebarOpen(false);
            }}
            onDeleteCanvases={(ids) => deleteCanvases(ids)}
            widthPercent={effectiveSidebarWidthPercent}
            setWidthPercent={setSidebarWidthPercent}
            isMobile={isMobile}
          />
        </>
      )}
      {showChrome && <Toolbar leftOffsetPercent={canvasLeftOffsetPercent} isMobile={isMobile} />}
      {showChrome && <ToolSettingsPanel />}
      {/* Made by Nishant */}
      {showChrome && (
      <div className="fixed bottom-3 right-4 z-50 px-3 py-1.5 bg-secondary/60 border border-border select-none pointer-events-none">
        <span className="text-[9px] font-mono text-muted-foreground block leading-tight">made by</span>
        <span className="text-[11px] font-mono font-bold text-foreground block leading-tight">Nishant</span>
      </div>
      )}
    </>
  );
};

export default Index;
