import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { AppHeader } from '@/components/canvas/AppHeader';
import { ToolSettingsPanel } from '@/components/canvas/ToolSettingsPanel';
import { CanvasSidebar } from '@/components/canvas/CanvasSidebar';
import { setThemePreference, useThemeTime } from '@/hooks/useThemeTime';
import { useAuth } from '@/hooks/useAuth';
import { useCanvasSync } from '@/hooks/useCanvasSync';
import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCanvasStore } from '@/store/canvasStore';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCanvasCollaboration } from '@/hooks/useCanvasCollaboration';
import { getPageNumber, nextPageSlug, parseCanvasRouteName } from '@/lib/canvasNaming';
import { parseSegmentedApiRequest, toOwnerPagePath } from '@/lib/pageApi';
import { recordPerfMetric, startDroppedFrameMonitor } from '@/lib/perfTelemetry';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from 'react-router-dom';

const CANVAS_BLOCK_CLIPBOARD_KEY = 'cnvs_block_clipboard_v1';
const DEFAULT_SITE_TITLE = 'CNVS - Your Second Brain Canvas';

type RouteMode = 'home' | 'loading' | 'editable' | 'readonly' | 'not-found';

interface CanvasSnapshot {
  blocks: any[];
  drawings: any[];
  pan: { x: number; y: number };
  zoom: number;
}

function slugifyUsername(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

function clampDesktopSidebarWidth(value: number) {
  return Math.max(8, Math.min(20, value));
}

const Index = () => {
  useThemeTime();
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ pageToken?: string }>();
  const rawUserToken = params.pageToken ? decodeURIComponent(params.pageToken) : null;
  const parsedApiRequest = useMemo(
    () => parseSegmentedApiRequest(rawUserToken, location.search),
    [rawUserToken, location.search]
  );

  const [routeMode, setRouteMode] = useState<RouteMode>(rawUserToken ? 'loading' : 'home');
  const [routeCanvasId, setRouteCanvasId] = useState<string | null>(null);
  const [routeCanvasName, setRouteCanvasName] = useState<string | null>(null);
  const [routeError, setRouteError] = useState('');

  const syncEnabled = routeMode === 'home' || routeMode === 'editable';

  const {
    canvases,
    currentCanvasId,
    currentCanvasName,
    createCanvas,
    selectCanvas,
    deleteCanvases,
    renameCanvas,
    renamePage,
    isCanvasLoading,
  } = useCanvasSync(session, { enabled: syncEnabled });

  const [sidebarWidthPercent, setSidebarWidthPercent] = useState(18);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const desktopSidebarWidthRef = useRef(18);
  const historyPastRef = useRef<CanvasSnapshot[]>([]);
  const historyFutureRef = useRef<CanvasSnapshot[]>([]);
  const lastHistoryRecordedAtRef = useRef(0);
  const isRestoringHistoryRef = useRef(false);
  const lastSnapshotRef = useRef<CanvasSnapshot | null>(null);
  const lastSerializedSnapshotRef = useRef('');
  const routeCanvasAppliedRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const [mobileToolSettingsOpen, setMobileToolSettingsOpen] = useState(false);

  const isLoggedIn = Boolean(session?.user?.id);
  const isReadOnlyMode = routeMode === 'readonly';
  const isRouteLoading = routeMode === 'loading';
  const isNotFoundMode = routeMode === 'not-found';
  const isEditorMode = !isReadOnlyMode && !isRouteLoading && !isNotFoundMode;
  const activeCanvasIdForCollab = currentCanvasId || routeCanvasId;
  const collaborationIdentity = useMemo(
    () => (user
      ? {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      }
      : null),
    [user?.id, user?.displayName, user?.avatarUrl]
  );

  const {
    collaborators,
    isConnected: collaborationConnected,
    toggleUserVisibility,
  } = useCanvasCollaboration(
    activeCanvasIdForCollab,
    collaborationIdentity,
    Boolean(user?.id && isEditorMode && activeCanvasIdForCollab)
  );

  const effectiveSidebarWidthPercent = isMobile ? 70 : sidebarWidthPercent;
  const canvasLeftOffsetPercent = isLoggedIn && isSidebarOpen && !isMobile && isEditorMode ? sidebarWidthPercent : 0;
  const effectiveCanvasLoading = isRouteLoading || (syncEnabled && isCanvasLoading);
  const showHeaderAndBars = !effectiveCanvasLoading;
  const activeCanvasName = currentCanvasName || routeCanvasName;

  const currentParsedName = parseCanvasRouteName(activeCanvasName);
  const pageItems = useMemo(
    () => {
      if (isReadOnlyMode && routeCanvasId) {
        return [{ id: routeCanvasId, label: currentParsedName.pageLabel }];
      }

      return canvases
        .map((canvas) => ({ id: canvas.id, parsed: parseCanvasRouteName(canvas.name) }))
        .filter((canvas) => canvas.parsed.canvasSlug === currentParsedName.canvasSlug)
        .sort((a, b) => {
          const aNum = getPageNumber(a.parsed.pageSlug) ?? Number.MAX_SAFE_INTEGER;
          const bNum = getPageNumber(b.parsed.pageSlug) ?? Number.MAX_SAFE_INTEGER;
          return aNum - bNum;
        })
        .map((canvas) => ({ id: canvas.id, label: canvas.parsed.pageLabel }));
    },
    [canvases, currentParsedName.canvasSlug, currentParsedName.pageLabel, isReadOnlyMode, routeCanvasId]
  );

  const cloneSnapshot = (snapshot: CanvasSnapshot): CanvasSnapshot => JSON.parse(JSON.stringify(snapshot));

  const getSnapshotFromStore = (): CanvasSnapshot => {
    const state = useCanvasStore.getState();
    return {
      blocks: state.blocks,
      drawings: state.drawingElements,
      pan: state.pan,
      zoom: state.zoom,
    };
  };

  const applySnapshot = (snapshot: CanvasSnapshot) => {
    isRestoringHistoryRef.current = true;
    const cloned = cloneSnapshot(snapshot);
    useCanvasStore.getState().loadCanvas(cloned.blocks as any, cloned.pan, cloned.zoom, cloned.drawings as any);
    lastSnapshotRef.current = cloned;
    lastSerializedSnapshotRef.current = JSON.stringify(cloned);
    isRestoringHistoryRef.current = false;
  };

  const pushHistory = (snapshot: CanvasSnapshot) => {
    historyPastRef.current.push(cloneSnapshot(snapshot));
    if (historyPastRef.current.length > 100) {
      historyPastRef.current.shift();
    }
  };

  const getSelectedBlocks = () => {
    const store = useCanvasStore.getState();
    const selected = store.blocks.filter((block) => store.selectedBlockIds.includes(block.id));
    if (selected.length) return selected;
    const single = store.blocks.find((block) => block.id === store.selectedBlockId);
    return single ? [single] : [];
  };

  const copySelectedBlocks = () => {
    const selected = getSelectedBlocks();
    if (!selected.length) {
      toast.info('Select a canvas component to copy');
      return false;
    }
    const payload = JSON.stringify({ type: 'cnvs-blocks', blocks: selected });
    localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, payload);
    void navigator.clipboard.writeText(payload).catch(() => undefined);
    toast.success('Canvas component copied');
    return true;
  };

  const deleteSelectedBlocks = () => {
    const store = useCanvasStore.getState();
    const selected = getSelectedBlocks();
    if (!selected.length) return false;
    selected.forEach((block) => store.deleteBlock(block.id));
    toast.success('Selected component removed');
    return true;
  };

  const cutSelectedBlocks = () => {
    if (!copySelectedBlocks()) return false;
    return deleteSelectedBlocks();
  };

  const toggleTextFormat = (field: 'textBold' | 'textItalic' | 'textUnderline' | 'textHighlight') => {
    const store = useCanvasStore.getState();
    const selected = getSelectedBlocks().filter((block) => block.type === 'note' || block.type === 'link' || block.type === 'todo');
    if (selected.length) {
      const next = !Boolean((selected[0] as any)[field]);
      selected.forEach((block) => store.updateBlock(block.id, { [field]: next } as any));
      return;
    }
    if (store.activeTool === 'text') {
      store.setToolSettings({ [field]: !store.toolSettings[field] } as any);
    }
  };

  const handleUndo = () => {
    const prev = historyPastRef.current.pop();
    if (!prev) return false;
    if (lastSnapshotRef.current) {
      historyFutureRef.current.push(cloneSnapshot(lastSnapshotRef.current));
    }
    applySnapshot(prev);
    return true;
  };

  const handleRedo = () => {
    const next = historyFutureRef.current.pop();
    if (!next) return false;
    if (lastSnapshotRef.current) {
      pushHistory(lastSnapshotRef.current);
    }
    applySnapshot(next);
    return true;
  };

  const handleCreatePage = () => {
    if (!session?.user?.id || !isEditorMode) return;
    const pageSlugs = canvases
      .map((canvas) => parseCanvasRouteName(canvas.name))
      .filter((canvas) => canvas.canvasSlug === currentParsedName.canvasSlug)
      .map((canvas) => canvas.pageSlug);
    const nextPage = nextPageSlug(pageSlugs);
    void createCanvas(`${currentParsedName.canvasSlug}/${nextPage}`);
  };

  const onCanvasProfilerRender = useCallback<ProfilerOnRenderCallback>((_id, phase, actualDuration, baseDuration) => {
    if (phase === 'update' && actualDuration < 3) return;
    recordPerfMetric('render_commit', actualDuration, {
      phase,
      base_duration_ms: Number(baseDuration.toFixed(2)),
    });
  }, []);

  useEffect(() => {
    if (!rawUserToken) {
      setRouteMode('home');
      setRouteCanvasId(null);
      setRouteCanvasName(null);
      setRouteError('');
      return;
    }

    if (!parsedApiRequest) {
      setRouteMode('not-found');
      setRouteCanvasId(null);
      setRouteCanvasName(null);
      setRouteError('Invalid page API token');
      return;
    }

    let cancelled = false;
    setRouteMode('loading');
    setRouteCanvasId(null);
    setRouteCanvasName(null);
    setRouteError('');

    const resolveRoute = async () => {
      const { data, error } = await (supabase as any).rpc('open_page_api_link', {
        p_user_token: parsedApiRequest.userToken,
        p_canvas_token: parsedApiRequest.canvasToken,
        p_page_token: parsedApiRequest.pageToken,
      });

      if (cancelled) return;

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.canvas_id) {
        if (session?.user?.id) {
          setRouteMode('home');
          setRouteCanvasId(null);
          setRouteCanvasName(null);
          setRouteError('');
          navigate('/', { replace: true });
          return;
        }
        setRouteMode('not-found');
        setRouteCanvasId(null);
        setRouteCanvasName(null);
        setRouteError('Page not found or link expired');
        return;
      }

      const canEdit = Boolean(row.can_edit);
      setRouteCanvasId(row.canvas_id);
      const resolvedName = `${String(row.canvas_name || 'untitled')}/${String(row.page_name || 'page-1.cnvs')}`;
      setRouteCanvasName(resolvedName);

      if (canEdit) {
        setRouteMode('editable');
        return;
      }

      useCanvasStore.getState().loadCanvas(
        (row.blocks as any[]) || [],
        { x: Number(row.pan_x) || 0, y: Number(row.pan_y) || 0 },
        typeof row.zoom === 'number' ? row.zoom : 1,
        (row.drawings as any[]) || []
      );
      setRouteMode('readonly');
    };

    void resolveRoute();

    return () => {
      cancelled = true;
    };
  }, [navigate, parsedApiRequest, rawUserToken, session?.user?.id]);

  useEffect(() => {
    routeCanvasAppliedRef.current = null;
  }, [routeCanvasId, rawUserToken, location.search]);

  useEffect(() => {
    if (routeMode !== 'editable' || !routeCanvasId || !syncEnabled) return;
    if (routeCanvasAppliedRef.current === routeCanvasId) return;
    routeCanvasAppliedRef.current = routeCanvasId;
    void selectCanvas(routeCanvasId);
  }, [routeMode, routeCanvasId, selectCanvas, syncEnabled]);

  useEffect(() => {
    if (!isMobile) {
      setMobileToolSettingsOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isLoggedIn || !activeCanvasName || !isEditorMode || !user) {
      document.title = DEFAULT_SITE_TITLE;
      return;
    }
    document.title = `CNVS : ${currentParsedName.canvasLabel} - ${currentParsedName.pageLabel}`;
  }, [activeCanvasName, currentParsedName.canvasLabel, currentParsedName.pageLabel, isEditorMode, isLoggedIn, user]);

  useEffect(() => {
    if (!user || !currentCanvasName || !isEditorMode) return;
    if (rawUserToken) return;
    const desired = toOwnerPagePath(slugifyUsername(user.username), currentCanvasName, user.id);
    const currentRoute = `${window.location.pathname}${window.location.search}`;
    if (currentRoute !== desired) {
      navigate(desired, { replace: true });
    }
  }, [currentCanvasName, isEditorMode, navigate, rawUserToken, user]);

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
    const initialSnapshot = getSnapshotFromStore();
    lastSnapshotRef.current = cloneSnapshot(initialSnapshot);
    lastSerializedSnapshotRef.current = JSON.stringify(initialSnapshot);

    const unsubscribe = useCanvasStore.subscribe((state, prevState) => {
      if (
        state.blocks === prevState.blocks &&
        state.drawingElements === prevState.drawingElements &&
        state.pan === prevState.pan &&
        state.zoom === prevState.zoom
      ) {
        return;
      }

      const nextSnapshot = {
        blocks: state.blocks,
        drawings: state.drawingElements,
        pan: state.pan,
        zoom: state.zoom,
      } as CanvasSnapshot;
      const serialized = JSON.stringify(nextSnapshot);

      if (serialized === lastSerializedSnapshotRef.current) return;
      if (isRestoringHistoryRef.current) {
        lastSnapshotRef.current = cloneSnapshot(nextSnapshot);
        lastSerializedSnapshotRef.current = serialized;
        return;
      }

      const now = Date.now();
      if (lastSnapshotRef.current && now - lastHistoryRecordedAtRef.current > 180) {
        pushHistory(lastSnapshotRef.current);
        lastHistoryRecordedAtRef.current = now;
      }
      historyFutureRef.current = [];
      lastSnapshotRef.current = cloneSnapshot(nextSnapshot);
      lastSerializedSnapshotRef.current = serialized;
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (effectiveCanvasLoading || !isEditorMode) return;

      if (!e.repeat && e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey && (e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'ControlLeft' || e.code === 'ControlRight')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cnvs-open-shortcuts'));
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable;
      const store = useCanvasStore.getState();
      const hasOnlySingleChar = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (isTyping) return;
      if (store.activeTool === 'text' && hasOnlySingleChar) return;

      const code = e.code;
      const hasCtrl = e.ctrlKey && !e.altKey && !e.metaKey;
      const hasCtrlOnly = hasCtrl && !e.shiftKey;
      const hasCtrlShiftOnly = hasCtrl && e.shiftKey;

      if (hasCtrlOnly && code === 'KeyZ') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (hasCtrlOnly && code === 'KeyY') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (hasCtrlOnly && code === 'KeyC') {
        e.preventDefault();
        copySelectedBlocks();
        return;
      }

      if (hasCtrlOnly && code === 'KeyX') {
        e.preventDefault();
        cutSelectedBlocks();
        return;
      }

      if (code === 'Delete' || code === 'Backspace') {
        if (deleteSelectedBlocks()) {
          e.preventDefault();
        }
        return;
      }

      if (hasCtrlOnly && code === 'KeyB') {
        e.preventDefault();
        toggleTextFormat('textBold');
        return;
      }

      if (hasCtrlOnly && code === 'KeyI') {
        e.preventDefault();
        toggleTextFormat('textItalic');
        return;
      }

      if (hasCtrlOnly && code === 'KeyU') {
        e.preventDefault();
        toggleTextFormat('textUnderline');
        return;
      }

      if (hasCtrlShiftOnly && code === 'KeyH') {
        e.preventDefault();
        toggleTextFormat('textHighlight');
        return;
      }

      if (hasOnlySingleChar && code === 'KeyN') { e.preventDefault(); store.addBlock('note'); return; }
      if (hasOnlySingleChar && code === 'KeyK') { e.preventDefault(); store.addBlock('link'); return; }
      if (hasOnlySingleChar && code === 'KeyD') { e.preventDefault(); store.addBlock('todo'); return; }
      if (hasOnlySingleChar && code === 'KeyM') { e.preventDefault(); store.addBlock('media'); return; }

      if (hasOnlySingleChar && code === 'KeyS') { e.preventDefault(); store.setActiveTool('select'); return; }
      if (hasOnlySingleChar && code === 'KeyH') { e.preventDefault(); store.setActiveTool('hand'); return; }
      if (hasOnlySingleChar && code === 'KeyP') { e.preventDefault(); store.setActiveTool('pencil'); return; }
      if (hasOnlySingleChar && code === 'KeyE') { e.preventDefault(); store.setActiveTool('eraser'); return; }
      if (hasOnlySingleChar && code === 'KeyT') { e.preventDefault(); store.setActiveTool('text'); return; }
      if (hasOnlySingleChar && code === 'KeyG') { e.preventDefault(); store.setActiveTool('shape'); return; }
      if (hasOnlySingleChar && code === 'KeyL') { e.preventDefault(); store.setActiveTool('line'); return; }
      if (hasOnlySingleChar && code === 'KeyA') { e.preventDefault(); store.setActiveTool('arrow'); return; }

      if (hasCtrlShiftOnly && code === 'Digit7') { e.preventDefault(); setThemePreference('light'); return; }
      if (hasCtrlShiftOnly && code === 'Digit8') { e.preventDefault(); setThemePreference('dark'); return; }
      if (hasCtrlShiftOnly && code === 'Digit9') { e.preventDefault(); setThemePreference('auto'); return; }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [effectiveCanvasLoading, isEditorMode]);

  useEffect(() => {
    return startDroppedFrameMonitor();
  }, []);

  if (isNotFoundMode) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-full max-w-md border border-border bg-card p-4 space-y-3 text-center">
          <h2 className="text-sm font-mono text-foreground">Page not found</h2>
          <p className="text-xs font-mono text-muted-foreground">
            {routeError || 'This page link is invalid or no longer available.'}
          </p>
          <button
            className="h-9 px-4 border border-border text-xs font-mono hover:bg-accent"
            onClick={() => navigate('/', { replace: true })}
          >
            Go to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Profiler id="infinite-canvas" onRender={onCanvasProfilerRender}>
        <InfiniteCanvas
          readOnly={isReadOnlyMode}
          leftOffsetPercent={canvasLeftOffsetPercent}
          loading={effectiveCanvasLoading}
        />
      </Profiler>

      {showHeaderAndBars && (isEditorMode || isReadOnlyMode) && (
        <AppHeader
          user={user}
          loading={loading}
          onSignIn={signInWithGoogle}
          readOnlyMode={isReadOnlyMode}
          forceShowCollaboratorsButton={isReadOnlyMode}
          currentCanvasId={currentCanvasId}
          currentCanvasName={activeCanvasName}
          currentCanvasLabel={currentParsedName.canvasLabel}
          currentPageLabel={currentParsedName.pageLabel}
          pageItems={pageItems}
          onSelectPage={(id) => {
            void selectCanvas(id);
          }}
          onCreatePage={isEditorMode ? handleCreatePage : undefined}
          onRenameCanvas={isEditorMode && session?.user?.id ? renameCanvas : undefined}
          onRenamePage={isEditorMode && session?.user?.id ? renamePage : undefined}
          leftOffsetPercent={canvasLeftOffsetPercent}
          showSidebarToggle={isLoggedIn && isEditorMode}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          collaborators={collaborators}
          collaborationConnected={collaborationConnected}
          onToggleCollaboratorVisibility={toggleUserVisibility}
        />
      )}

      {isSidebarOpen && isEditorMode && (
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
            user={user ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl } : null}
            onSignOut={signOut}
            widthPercent={effectiveSidebarWidthPercent}
            setWidthPercent={setSidebarWidthPercent}
            isMobile={isMobile}
          />
        </>
      )}

      {showHeaderAndBars && (isEditorMode || isReadOnlyMode) && (
        <Toolbar
          leftOffsetPercent={canvasLeftOffsetPercent}
          isMobile={isMobile}
          allowedToolIds={isReadOnlyMode ? ['select', 'hand'] : undefined}
          showMobileSettingsButton={isEditorMode && isMobile}
          isMobileSettingsOpen={mobileToolSettingsOpen}
          onToggleMobileSettings={isEditorMode ? (() => setMobileToolSettingsOpen((prev) => !prev)) : undefined}
          onOpenMobileSettings={isEditorMode ? (() => setMobileToolSettingsOpen(true)) : undefined}
          onUndo={isEditorMode ? handleUndo : undefined}
          onRedo={isEditorMode ? handleRedo : undefined}
          onCopy={isEditorMode ? copySelectedBlocks : undefined}
          onCut={isEditorMode ? cutSelectedBlocks : undefined}
          onDelete={isEditorMode ? deleteSelectedBlocks : undefined}
        />
      )}

      {showHeaderAndBars && isEditorMode && (
        <ToolSettingsPanel
          isMobile={isMobile}
          mobileOpen={mobileToolSettingsOpen}
          onMobileOpenChange={setMobileToolSettingsOpen}
        />
      )}

      {showHeaderAndBars && (
        isMobile ? (
          <div
            className="fixed right-0 z-50 px-1 py-2 bg-transparent border border-border border-r-0 select-none pointer-events-none"
            style={{ bottom: 'calc(1rem + 44px)' }}
          >
            <span className="block text-[9px] font-mono font-bold text-foreground [writing-mode:vertical-rl] tracking-wider">MADE BY NISHANT</span>
          </div>
        ) : (
          <div className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-transparent border border-border select-none pointer-events-none">
            <span className="text-[9px] font-mono text-muted-foreground block leading-tight">MADE BY</span>
            <span className="text-[11px] font-mono font-bold text-foreground block leading-tight">NISHANT</span>
          </div>
        )
      )}
    </>
  );
};

export default Index;
