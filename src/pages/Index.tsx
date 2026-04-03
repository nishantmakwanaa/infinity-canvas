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
import { getPageNumber, nextPageSlug, parseCanvasRouteName } from '@/lib/canvasNaming';

const CANVAS_BLOCK_CLIPBOARD_KEY = 'cnvs_block_clipboard_v1';

function slugifyUsername(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

function clampDesktopSidebarWidth(value: number) {
  return Math.max(10, Math.min(30, value));
}

const Index = () => {
  useThemeTime();
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ username?: string; canvasName?: string; pageName?: string }>();
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
  const desktopSidebarWidthRef = useRef(18);
  const isMobile = useIsMobile();

  const isLoggedIn = Boolean(session?.user?.id);
  const routeOwnerSlug = params.username ? decodeURIComponent(params.username).toLowerCase() : null;
  const signedInOwnerSlug = user ? slugifyUsername(user.username) : null;
  const isDirectOwnerCanvasRoute = Boolean(params.username && params.canvasName);
  const isOwnerRouteAuthorized = Boolean(
    isDirectOwnerCanvasRoute
      ? isLoggedIn && routeOwnerSlug && signedInOwnerSlug && routeOwnerSlug === signedInOwnerSlug
      : true
  );
  const showUnauthorizedOwnerRoute = isDirectOwnerCanvasRoute && !isOwnerRouteAuthorized;
  const effectiveSidebarWidthPercent = isMobile ? 70 : sidebarWidthPercent;
  const canvasLeftOffsetPercent = isLoggedIn && isSidebarOpen && !isMobile ? sidebarWidthPercent : 0;
  const showHeaderAndBars = !isCanvasLoading;
  const currentParsedName = parseCanvasRouteName(currentCanvasName);
  const pageItems = canvases
    .map((canvas) => ({ id: canvas.id, parsed: parseCanvasRouteName(canvas.name) }))
    .filter((canvas) => canvas.parsed.canvasSlug === currentParsedName.canvasSlug)
    .sort((a, b) => {
      const aNum = getPageNumber(a.parsed.pageSlug) ?? Number.MAX_SAFE_INTEGER;
      const bNum = getPageNumber(b.parsed.pageSlug) ?? Number.MAX_SAFE_INTEGER;
      return aNum - bNum;
    })
    .map((canvas) => ({ id: canvas.id, label: canvas.parsed.pageLabel }));

  const handleCreatePage = () => {
    if (!session?.user?.id) return;
    const pageSlugs = canvases
      .map((canvas) => parseCanvasRouteName(canvas.name))
      .filter((canvas) => canvas.canvasSlug === currentParsedName.canvasSlug)
      .map((canvas) => canvas.pageSlug);
    const nextPage = nextPageSlug(pageSlugs);
    void createCanvas(`${currentParsedName.canvasSlug}/${nextPage}`);
  };

  useEffect(() => {
    if (showUnauthorizedOwnerRoute) return;
    if (!session?.user?.id || initialRouteSyncedRef.current) return;

    const routeCanvasName = params.canvasName ? decodeURIComponent(params.canvasName) : '';
    const routePageName = params.pageName ? decodeURIComponent(params.pageName) : '';
    const routeName = routeCanvasName ? (routePageName ? `${routeCanvasName}/${routePageName}` : routeCanvasName) : '';
    initialRouteSyncedRef.current = true;

    if (!routeName) {
      return;
    }

    if (params.username) {
      void selectCanvasByRoute(params.username, routeCanvasName, routePageName || undefined);
    } else {
      void selectCanvasByName(routeName);
    }
  }, [showUnauthorizedOwnerRoute, session?.user?.id, params.canvasName, params.pageName, params.username, selectCanvasByName, selectCanvasByRoute]);

  useEffect(() => {
    if (!user || !currentCanvasName) return;
    const parsed = parseCanvasRouteName(currentCanvasName);
    const desired = `/${slugifyUsername(user.username)}/${encodeURIComponent(parsed.canvasSlug)}/${encodeURIComponent(parsed.pageSlug)}`;
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
    if (isMobile) {
      desktopSidebarWidthRef.current = clampDesktopSidebarWidth(sidebarWidthPercent);
      setSidebarWidthPercent(70);
      return;
    }

    setSidebarWidthPercent(clampDesktopSidebarWidth(desktopSidebarWidthRef.current || 18));
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    desktopSidebarWidthRef.current = clampDesktopSidebarWidth(sidebarWidthPercent);
  }, [isMobile, sidebarWidthPercent]);

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
        const selected = store.blocks.filter((block) => store.selectedBlockIds.includes(block.id));
        if (!selected.length) {
          const single = store.blocks.find((block) => block.id === store.selectedBlockId);
          if (single) {
            selected.push(single);
          }
        }
        if (!selected.length) {
          toast.info('Select a canvas component to copy');
          return;
        }
        const payload = JSON.stringify({ type: 'cnvs-blocks', blocks: selected });
        localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, payload);
        void navigator.clipboard.writeText(payload).catch(() => undefined);
        e.preventDefault();
        toast.success('Canvas component copied');
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
    showUnauthorizedOwnerRoute ? (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-full max-w-md border border-border bg-card p-4 space-y-3 text-center">
          <h2 className="text-sm font-mono text-foreground">Unauthorized access</h2>
          <p className="text-xs font-mono text-muted-foreground">
            This owner route can only be opened by the signed-in owner account.
          </p>
          {!isLoggedIn ? (
            <button
              className="h-9 px-4 border border-foreground bg-foreground text-background text-xs font-mono"
              onClick={signInWithGoogle}
            >
              Sign in as owner
            </button>
          ) : (
            <button
              className="h-9 px-4 border border-border text-xs font-mono hover:bg-accent"
              onClick={signOut}
            >
              Switch account
            </button>
          )}
        </div>
      </div>
    ) : (
    <>
      <InfiniteCanvas
        leftOffsetPercent={canvasLeftOffsetPercent}
        loading={isCanvasLoading}
      />
      {showHeaderAndBars && (
        <AppHeader
          user={user}
          loading={loading}
          onSignIn={signInWithGoogle}
          onSignOut={signOut}
          currentCanvasId={currentCanvasId}
          currentCanvasName={currentCanvasName}
          currentCanvasLabel={currentParsedName.canvasLabel}
          currentPageLabel={currentParsedName.pageLabel}
          pageItems={pageItems}
          onSelectPage={(id) => {
            void selectCanvas(id);
          }}
          onCreatePage={handleCreatePage}
          leftOffsetPercent={canvasLeftOffsetPercent}
          showSidebarToggle={isLoggedIn}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
      )}
      {isSidebarOpen && (
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
      {showHeaderAndBars && <Toolbar leftOffsetPercent={canvasLeftOffsetPercent} isMobile={isMobile} />}
      {showHeaderAndBars && <ToolSettingsPanel />}
      {/* Made by Nishant */}
      {showHeaderAndBars && (
        isMobile ? (
          <div
            className="fixed right-0 z-50 px-1 py-2 bg-secondary/60 border border-border border-r-0 select-none pointer-events-none"
            style={{ bottom: 'calc(1rem + 44px)' }}
          >
            <span className="block text-[9px] font-mono font-bold text-foreground [writing-mode:vertical-rl] tracking-wider">made by nishant</span>
          </div>
        ) : (
          <div className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-secondary/60 border border-border select-none pointer-events-none">
            <span className="text-[9px] font-mono text-muted-foreground block leading-tight">made by</span>
            <span className="text-[11px] font-mono font-bold text-foreground block leading-tight">Nishant</span>
          </div>
        )
      )}
    </>
    )
  );
};

export default Index;
