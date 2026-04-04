import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { AppHeader } from '@/components/canvas/AppHeader';
import { ToolSettingsPanel } from '@/components/canvas/ToolSettingsPanel';
import { CanvasSidebar } from '@/components/canvas/CanvasSidebar';
import { AuthGateDialog } from '@/components/canvas/AuthGateDialog';
import { setThemePreference, useThemeTime } from '@/hooks/useThemeTime';
import { useAuth } from '@/hooks/useAuth';
import { useCanvasSync } from '@/hooks/useCanvasSync';
import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCanvasStore } from '@/store/canvasStore';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSocketCanvasCollaboration } from '@/hooks/useSocketCanvasCollaboration';
import { useCanvasCollaboration } from '@/hooks/useCanvasCollaboration';
import { getPageNumber, nextPageSlug, parseCanvasRouteName } from '@/lib/canvasNaming';
import { parseSegmentedApiRequest, toOwnerPagePath } from '@/lib/pageApi';
import { recordPerfMetric, startDroppedFrameMonitor } from '@/lib/perfTelemetry';
import { syncCanvasPermissionFromShare } from '@/lib/sharePermissionSync';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from 'react-router-dom';

const CANVAS_BLOCK_CLIPBOARD_KEY = 'cnvs_block_clipboard_v1';
const DEFAULT_SITE_TITLE = 'CNVS - Your Second Brain Canvas';

type RouteMode = 'home' | 'loading' | 'editable' | 'readonly' | 'not-found' | 'auth-required';

type PendingSidebarAction =
  | { type: 'select'; canvasId: string }
  | { type: 'create'; name?: string }
  | { type: 'delete'; ids: string[] };

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
    sharedCanvases,
    shareAccessByCanvasId,
    joinedCanvasAccessByCanvasId,
    currentCanvasId,
    currentCanvasName,
    createCanvas,
    selectCanvas,
    markJoinedCanvasAccess,
    deleteCanvases,
    renameCanvas,
    renamePage,
    isCanvasLoading,
  } = useCanvasSync(session, { enabled: syncEnabled });

  const [sidebarWidthPercent, setSidebarWidthPercent] = useState(18);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showGuestAuthDialog, setShowGuestAuthDialog] = useState(false);
  const desktopSidebarWidthRef = useRef(18);
  const historyPastRef = useRef<CanvasSnapshot[]>([]);
  const historyFutureRef = useRef<CanvasSnapshot[]>([]);
  const lastHistoryRecordedAtRef = useRef(0);
  const isRestoringHistoryRef = useRef(false);
  const lastSnapshotRef = useRef<CanvasSnapshot | null>(null);
  const lastSerializedSnapshotRef = useRef('');
  const editorCapToastShownRef = useRef(false);
  const isMobile = useIsMobile();
  const [mobileToolSettingsOpen, setMobileToolSettingsOpen] = useState(false);
  const pendingSidebarActionRef = useRef<PendingSidebarAction | null>(null);
  const routeSelectFailedCanvasIdRef = useRef<string | null>(null);
  const routeSelectFailedAtRef = useRef(0);
  const shareEditAuthRedirectStartedRef = useRef(false);

  const isLoggedIn = Boolean(session?.user?.id);
  const isShareEditRoute = parsedApiRequest?.kind === 'share-edit';
  const showShareEditAuthGate = !loading && !isLoggedIn && isShareEditRoute;
  const showGuestSignInAuthGate = !loading && !isLoggedIn && showGuestAuthDialog;
  const isReadOnlyMode = routeMode === 'readonly';
  const isRouteLoading = routeMode === 'loading';
  const isAuthRequiredMode = routeMode === 'auth-required';
  const isNotFoundMode = routeMode === 'not-found';
  const isEditorMode = routeMode === 'home' || routeMode === 'editable';
  const effectiveCurrentCanvasId = rawUserToken ? (routeCanvasId || currentCanvasId) : currentCanvasId;
  const activeCanvasIdForCollab = rawUserToken ? (routeCanvasId || currentCanvasId) : (currentCanvasId || routeCanvasId);
  const activeAccessCanvasId = effectiveCurrentCanvasId || activeCanvasIdForCollab;
  const isCurrentCanvasOwned = Boolean(
    activeAccessCanvasId && canvases.some((canvas) => canvas.id === activeAccessCanvasId)
  );
  const currentOwnedShareAccess = activeAccessCanvasId ? shareAccessByCanvasId[activeAccessCanvasId] : undefined;
  const currentJoinedShareAccess = activeAccessCanvasId ? joinedCanvasAccessByCanvasId[activeAccessCanvasId] : undefined;
  const isShareRouteToken = Boolean(rawUserToken && (parsedApiRequest?.kind === 'share' || parsedApiRequest?.kind === 'share-edit'));
  const hasSharedAccess = currentOwnedShareAccess === 'viewer' || currentOwnedShareAccess === 'editor'
    || currentJoinedShareAccess === 'viewer' || currentJoinedShareAccess === 'editor';
  const allowCollaboratorsForCurrentCanvas = Boolean(
    user?.id &&
    activeCanvasIdForCollab &&
    (isEditorMode || isReadOnlyMode) &&
    (isCurrentCanvasOwned || hasSharedAccess || isShareRouteToken)
  );
  const showCollaboratorsButtonForCurrentCanvas = Boolean(
    user?.id &&
    activeCanvasIdForCollab &&
    (
      currentOwnedShareAccess === 'editor' ||
      currentJoinedShareAccess === 'editor' ||
      (rawUserToken && parsedApiRequest?.kind === 'share-edit')
    )
  );
  const requireEditorSlotForCurrentCanvas = Boolean(
    user?.id &&
    isEditorMode &&
    activeCanvasIdForCollab &&
    (
      isCurrentCanvasOwned ||
      currentOwnedShareAccess === 'editor' ||
      currentJoinedShareAccess === 'editor' ||
      (rawUserToken && parsedApiRequest?.kind === 'share-edit')
    )
  );
  const collaborationActivationReady = Boolean(activeCanvasIdForCollab) && !isRouteLoading && !isCanvasLoading;
  const readOnlyShareUrl = useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (!(rawUserToken && parsedApiRequest?.kind === 'share')) return null;
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  }, [location.pathname, location.search, parsedApiRequest?.kind, rawUserToken]);
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

  const socketServerUrl = String(import.meta.env.VITE_SOCKET_SERVER_URL || '').trim();
  const preferSocketTransport = socketServerUrl.length > 0;

  const {
    collaborators: socketCollaborators,
    isConnected: socketConnected,
    toggleUserVisibility: socketToggleUserVisibility,
    editorSlotGranted: socketEditorSlotGranted,
    editorSlotActiveCount: socketEditorSlotActiveCount,
    editorSlotLimitCount: socketEditorSlotLimitCount,
  } = useSocketCanvasCollaboration(
    activeCanvasIdForCollab,
    collaborationIdentity,
    allowCollaboratorsForCurrentCanvas && collaborationActivationReady && preferSocketTransport,
    requireEditorSlotForCurrentCanvas
  );

  const {
    collaborators: realtimeCollaborators,
    isConnected: realtimeConnected,
    toggleUserVisibility: realtimeToggleUserVisibility,
    editorSlotGranted: realtimeEditorSlotGranted,
    editorSlotActiveCount: realtimeEditorSlotActiveCount,
    editorSlotLimitCount: realtimeEditorSlotLimitCount,
  } = useCanvasCollaboration(
    activeCanvasIdForCollab,
    collaborationIdentity,
    allowCollaboratorsForCurrentCanvas && collaborationActivationReady && (!preferSocketTransport || !socketConnected),
    requireEditorSlotForCurrentCanvas
  );

  const useSocketTransport = preferSocketTransport && socketConnected;
  const collaborators = useSocketTransport ? socketCollaborators : realtimeCollaborators;
  const collaborationConnected = useSocketTransport ? socketConnected : realtimeConnected;
  const toggleUserVisibility = useSocketTransport ? socketToggleUserVisibility : realtimeToggleUserVisibility;
  const editorSlotGranted = useSocketTransport ? socketEditorSlotGranted : realtimeEditorSlotGranted;
  const editorSlotActiveCount = useSocketTransport ? socketEditorSlotActiveCount : realtimeEditorSlotActiveCount;
  const editorSlotLimitCount = useSocketTransport ? socketEditorSlotLimitCount : realtimeEditorSlotLimitCount;
  const editorSlotCapReached = editorSlotLimitCount > 0 && editorSlotActiveCount >= editorSlotLimitCount;

  const collabEditLocked = requireEditorSlotForCurrentCanvas && !editorSlotGranted && !isCurrentCanvasOwned && editorSlotCapReached;
  const effectiveReadOnlyMode = isReadOnlyMode || isAuthRequiredMode || collabEditLocked;
  const canMutateCanvas = isEditorMode && !collabEditLocked;

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
    const nextName = `${currentParsedName.canvasSlug}/${nextPage}`;
    if (rawUserToken) {
      pendingSidebarActionRef.current = { type: 'create', name: nextName };
      setRouteMode('home');
      setRouteCanvasId(null);
      setRouteCanvasName(null);
      setRouteError('');
      navigate('/', { replace: true });
      return;
    }
    void createCanvas(nextName);
  };

  const openCanvasFromUi = useCallback(async (canvasId: string) => {
    if (!canvasId) return;

    const joinedAccess = joinedCanvasAccessByCanvasId[canvasId];
    const isJoinedCanvas = Boolean(joinedAccess) || sharedCanvases.some((canvas) => canvas.id === canvasId);

    if (isJoinedCanvas && session?.user?.id) {
      void syncCanvasPermissionFromShare(
        canvasId,
        joinedAccess === 'editor' ? 'editor' : 'viewer'
      );
    }

    let loaded = false;
    try {
      loaded = await selectCanvas(canvasId);
    } catch {
      loaded = false;
    }
    if (!loaded) {
      toast.error('Unable to open this canvas. Please try again.');
    }
  }, [joinedCanvasAccessByCanvasId, selectCanvas, session?.user?.id, sharedCanvases]);

  const handleSelectCanvasFromUi = useCallback((canvasId: string) => {
    if (!canvasId) return;
    if (rawUserToken) {
      setRouteMode('home');
      setRouteCanvasId(null);
      setRouteCanvasName(null);
      setRouteError('');
    }
    void openCanvasFromUi(canvasId);
  }, [openCanvasFromUi, rawUserToken]);

  const handleCreateCanvasFromUi = useCallback(() => {
    if (rawUserToken) {
      pendingSidebarActionRef.current = { type: 'create' };
      setRouteMode('home');
      setRouteCanvasId(null);
      setRouteCanvasName(null);
      setRouteError('');
      navigate('/', { replace: true });
      return;
    }
    void createCanvas();
  }, [createCanvas, navigate, rawUserToken]);

  const handleDeleteCanvasesFromUi = useCallback((ids: string[]) => {
    if (!ids.length) return;
    if (rawUserToken) {
      pendingSidebarActionRef.current = { type: 'delete', ids: [...ids] };
      setRouteMode('home');
      setRouteCanvasId(null);
      setRouteCanvasName(null);
      setRouteError('');
      navigate('/', { replace: true });
      return;
    }
    void deleteCanvases(ids);
  }, [deleteCanvases, navigate, rawUserToken]);

  useEffect(() => {
    if (rawUserToken) return;
    const pendingAction = pendingSidebarActionRef.current;
    if (!pendingAction) return;
    pendingSidebarActionRef.current = null;

    if (pendingAction.type === 'select') {
      void openCanvasFromUi(pendingAction.canvasId);
      return;
    }

    if (pendingAction.type === 'create') {
      void createCanvas(pendingAction.name);
      return;
    }

    if (pendingAction.type === 'delete') {
      void deleteCanvases(pendingAction.ids);
    }
  }, [createCanvas, deleteCanvases, openCanvasFromUi, rawUserToken]);

  const onCanvasProfilerRender = useCallback<ProfilerOnRenderCallback>((_id, phase, actualDuration, baseDuration) => {
    if (phase === 'update' && actualDuration < 3) return;
    recordPerfMetric('render_commit', actualDuration, {
      phase,
      base_duration_ms: Number(baseDuration.toFixed(2)),
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn && showGuestAuthDialog) {
      setShowGuestAuthDialog(false);
    }
  }, [isLoggedIn, showGuestAuthDialog]);

  useEffect(() => {
    if (!showShareEditAuthGate) {
      shareEditAuthRedirectStartedRef.current = false;
      return;
    }
    if (shareEditAuthRedirectStartedRef.current) return;
    shareEditAuthRedirectStartedRef.current = true;
    void signInWithGoogle({ intent: 'return-current' });
  }, [showShareEditAuthGate, signInWithGoogle]);

  useEffect(() => {
    if (!collabEditLocked) {
      editorCapToastShownRef.current = false;
      return;
    }
    if (editorCapToastShownRef.current) return;
    editorCapToastShownRef.current = true;
    toast.error(`Editor limit reached (${editorSlotLimitCount}). Try again shortly.`);
  }, [collabEditLocked, editorSlotLimitCount]);

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
      try {
        const { data, error } = await supabase.rpc('open_page_api_link', {
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

        const shareAccess = String((row as any)?.share_access || '').toLowerCase();
        const isShareRoute = Boolean((row as any)?.is_share);
        const isShareEditLink = parsedApiRequest?.kind === 'share-edit';
        const requiresAuthGate = Boolean(isShareEditLink && !session?.user?.id);
        if (isShareRoute && session?.user?.id && row?.canvas_id) {
          const requestedAccess = (shareAccess === 'editor' || isShareEditLink) ? 'editor' : 'viewer';
          markJoinedCanvasAccess(row.canvas_id, requestedAccess);
          try {
            await syncCanvasPermissionFromShare(row.canvas_id, requestedAccess);
          } catch {
            // Best-effort sync only.
          }
          if (cancelled) return;
        }

        // Always seed canvas content from route payload so opening never renders blank.
        useCanvasStore.getState().loadCanvas(
          (row.blocks as any[]) || [],
          { x: Number(row.pan_x) || 0, y: Number(row.pan_y) || 0 },
          typeof row.zoom === 'number' ? row.zoom : 1,
          (row.drawings as any[]) || []
        );

        const canEdit = isShareRoute
          ? Boolean(isShareEditLink && session?.user?.id && (Boolean(row.can_edit) || shareAccess === 'editor'))
          : Boolean(row.can_edit);
        setRouteCanvasId(row.canvas_id);
        const resolvedName = `${String(row.canvas_name || 'untitled')}/${String(row.page_name || 'page-1.cnvs')}`;
        setRouteCanvasName(resolvedName);

        if (canEdit) {
          setRouteMode('editable');
          return;
        }

        if (requiresAuthGate) {
          setRouteMode('auth-required');
          setRouteError('Login required to edit shared canvas');
          return;
        }
        setRouteMode('readonly');
      } catch {
        if (cancelled) return;
        setRouteMode('not-found');
        setRouteCanvasId(null);
        setRouteCanvasName(null);
        setRouteError('Unable to open this page right now. Please try again.');
      }
    };

    void resolveRoute();

    return () => {
      cancelled = true;
    };
  }, [markJoinedCanvasAccess, navigate, parsedApiRequest, rawUserToken, session?.user?.id]);

  useEffect(() => {
    if (routeMode !== 'editable' || !routeCanvasId || !syncEnabled) return;
    const now = Date.now();
    if (
      routeSelectFailedCanvasIdRef.current === routeCanvasId
      && now - routeSelectFailedAtRef.current < 3000
    ) {
      return;
    }
    if (currentCanvasId === routeCanvasId) return;
    void selectCanvas(routeCanvasId).then((loaded) => {
      if (loaded) {
        routeSelectFailedCanvasIdRef.current = null;
        routeSelectFailedAtRef.current = 0;
        return;
      }
      routeSelectFailedCanvasIdRef.current = routeCanvasId;
      routeSelectFailedAtRef.current = Date.now();
      if (rawUserToken) {
        if (parsedApiRequest?.kind === 'share' || parsedApiRequest?.kind === 'share-edit') {
          setRouteMode('readonly');
          setRouteError(
            parsedApiRequest?.kind === 'share-edit'
              ? 'Shared edit is temporarily unavailable. Opened read-only.'
              : 'Canvas is view-only in this session.'
          );
          return;
        }
        setRouteMode('editable');
        setRouteError('Canvas load retrying. If this persists, refresh once.');
      }
    }).catch(() => {
      routeSelectFailedCanvasIdRef.current = routeCanvasId;
      routeSelectFailedAtRef.current = Date.now();
      if (rawUserToken) {
        setRouteMode('readonly');
        setRouteError('Unable to open edit session right now. Opened read-only.');
      }
    });
  }, [currentCanvasId, parsedApiRequest?.kind, rawUserToken, routeMode, routeCanvasId, selectCanvas, syncEnabled]);

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
    if (!user || !currentCanvasName || !currentCanvasId || !isEditorMode) return;
    if (rawUserToken) return;

    const isOwnedCurrentCanvas = canvases.some((canvas) => canvas.id === currentCanvasId);
    if (!isOwnedCurrentCanvas) {
      // Joined/shared canvases should not be rewritten to owner route for current user.
      return;
    }

    const desired = toOwnerPagePath(slugifyUsername(user.username), currentCanvasName, user.id);
    const currentRoute = `${window.location.pathname}${window.location.search}`;
    if (currentRoute !== desired) {
      navigate(desired, { replace: true });
    }
  }, [canvases, currentCanvasId, currentCanvasName, isEditorMode, navigate, rawUserToken, user]);

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
          readOnly={effectiveReadOnlyMode}
          leftOffsetPercent={canvasLeftOffsetPercent}
          loading={effectiveCanvasLoading}
        />
      </Profiler>

      {showHeaderAndBars && (isEditorMode || effectiveReadOnlyMode) && (
        <AppHeader
          user={user}
          loading={loading}
          onSignIn={() => setShowGuestAuthDialog(true)}
          canShareCurrentCanvas={isCurrentCanvasOwned}
          readOnlyMode={effectiveReadOnlyMode}
          readOnlyShareUrl={readOnlyShareUrl}
          forceShowCollaboratorsButton={showCollaboratorsButtonForCurrentCanvas}
          currentCanvasId={effectiveCurrentCanvasId}
          currentCanvasName={activeCanvasName}
          currentCanvasLabel={currentParsedName.canvasLabel}
          currentPageLabel={currentParsedName.pageLabel}
          pageItems={pageItems}
          onSelectPage={(id) => {
            handleSelectCanvasFromUi(id);
          }}
          onCreatePage={canMutateCanvas ? handleCreatePage : undefined}
          onRenameCanvas={canMutateCanvas && session?.user?.id ? renameCanvas : undefined}
          onRenamePage={canMutateCanvas && session?.user?.id ? renamePage : undefined}
          leftOffsetPercent={canvasLeftOffsetPercent}
          showSidebarToggle={isLoggedIn && isEditorMode}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          collaborators={collaborators}
          collaborationConnected={collaborationConnected}
          collaborationActiveCount={editorSlotActiveCount}
          collaborationLimitCount={editorSlotLimitCount}
          onToggleCollaboratorVisibility={toggleUserVisibility}
        />
      )}

      {isSidebarOpen && canMutateCanvas && (
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
            sharedCanvases={sharedCanvases}
            shareAccessByCanvasId={shareAccessByCanvasId}
            joinedCanvasAccessByCanvasId={joinedCanvasAccessByCanvasId}
            currentCanvasId={effectiveCurrentCanvasId}
            onCreateCanvas={handleCreateCanvasFromUi}
            onSelectCanvas={(id) => {
              handleSelectCanvasFromUi(id);
              if (isMobile) setIsSidebarOpen(false);
            }}
            onDeleteCanvases={handleDeleteCanvasesFromUi}
            user={user ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl } : null}
            onSignOut={signOut}
            widthPercent={effectiveSidebarWidthPercent}
            setWidthPercent={setSidebarWidthPercent}
            isMobile={isMobile}
          />
        </>
      )}

      {showHeaderAndBars && (canMutateCanvas || effectiveReadOnlyMode) && (
        <Toolbar
          leftOffsetPercent={canvasLeftOffsetPercent}
          isMobile={isMobile}
          allowedToolIds={effectiveReadOnlyMode ? ['select', 'hand'] : undefined}
          showMobileSettingsButton={canMutateCanvas && isMobile}
          isMobileSettingsOpen={mobileToolSettingsOpen}
          onToggleMobileSettings={canMutateCanvas ? (() => setMobileToolSettingsOpen((prev) => !prev)) : undefined}
          onOpenMobileSettings={canMutateCanvas ? (() => setMobileToolSettingsOpen(true)) : undefined}
          onUndo={canMutateCanvas ? handleUndo : undefined}
          onRedo={canMutateCanvas ? handleRedo : undefined}
          onCopy={canMutateCanvas ? copySelectedBlocks : undefined}
          onCut={canMutateCanvas ? cutSelectedBlocks : undefined}
          onDelete={canMutateCanvas ? deleteSelectedBlocks : undefined}
        />
      )}

      {showHeaderAndBars && canMutateCanvas && (
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

      {showGuestSignInAuthGate && (
        <AuthGateDialog
          mode={rawUserToken ? 'share' : 'home'}
          loading={loading}
          onSignIn={() => {
            void signInWithGoogle({ intent: 'dashboard' });
          }}
          presentation="overlay"
          dismissOnBackdrop={true}
          onClose={() => setShowGuestAuthDialog(false)}
        />
      )}

      {(showShareEditAuthGate || isAuthRequiredMode) && (
        <AuthGateDialog
          mode="share-edit"
          loading={loading}
          onSignIn={() => {
            void signInWithGoogle({ intent: 'return-current' });
          }}
          presentation="overlay"
          dismissOnBackdrop={false}
        />
      )}
    </>
  );
};

export default Index;
