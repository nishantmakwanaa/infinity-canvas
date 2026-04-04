import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, CanvasBlock, DrawingElement } from '@/store/canvasStore';
import type { Session } from '@supabase/supabase-js';
import { createDefaultCanvasRouteName, parseCanvasRouteName, toCanvasRouteName } from '@/lib/canvasNaming';
import { recordPerfMetric } from '@/lib/perfTelemetry';
import { toast } from 'sonner';

export interface CanvasMeta {
  id: string;
  name: string;
  updated_at: string;
}

interface UseCanvasSyncOptions {
  enabled?: boolean;
}

export type CanvasAccessLevel = 'viewer' | 'editor';
type JoinedCanvasAccessMap = Record<string, CanvasAccessLevel>;

const GUEST_CANVAS_STORAGE_KEY = 'cnvs_guest_canvas_v1';
const LAST_OPENED_CANVAS_KEY_PREFIX = 'cnvs_last_opened_canvas_v1_';
const PENDING_CANVAS_SYNC_KEY_PREFIX = 'cnvs_pending_canvas_sync_v1_';
const JOINED_CANVAS_ACCESS_KEY_PREFIX = 'cnvs_joined_canvas_access_v1_';

interface LocalCanvasSnapshot {
  blocks: CanvasBlock[];
  drawings: DrawingElement[];
  pan: { x: number; y: number };
  zoom: number;
}

interface PendingCanvasSyncSnapshot extends LocalCanvasSnapshot {
  canvasId: string;
  userId: string;
  updatedAt: string;
  queuedAtMs?: number;
  signature?: string;
}

function isLegacyUsernameCanvasName(name: string | null | undefined) {
  if (!name) return false;
  return /'s Canvas$/i.test(name.trim());
}

function isBlankSnapshot(snapshot: LocalCanvasSnapshot | null) {
  if (!snapshot) return true;
  const noBlocks = (snapshot.blocks || []).length === 0;
  const noDrawings = (snapshot.drawings || []).length === 0;
  return noBlocks && noDrawings;
}

function readGuestSnapshot(): LocalCanvasSnapshot | null {
  try {
    const raw = localStorage.getItem(GUEST_CANVAS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalCanvasSnapshot;
    if (!parsed || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.drawings) || !parsed.pan || typeof parsed.zoom !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeGuestSnapshot(snapshot: LocalCanvasSnapshot) {
  try {
    localStorage.setItem(GUEST_CANVAS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota/storage access errors.
  }
}

function clearGuestSnapshot() {
  try {
    localStorage.removeItem(GUEST_CANVAS_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
}

function lastOpenedCanvasKey(userId: string) {
  return `${LAST_OPENED_CANVAS_KEY_PREFIX}${userId}`;
}

function readLastOpenedCanvasId(userId: string): string | null {
  try {
    return localStorage.getItem(lastOpenedCanvasKey(userId));
  } catch {
    return null;
  }
}

function writeLastOpenedCanvasId(userId: string, canvasId: string) {
  try {
    localStorage.setItem(lastOpenedCanvasKey(userId), canvasId);
  } catch {
    // Ignore storage access errors.
  }
}

function pendingCanvasSyncKey(userId: string, canvasId: string) {
  return `${PENDING_CANVAS_SYNC_KEY_PREFIX}${userId}_${canvasId}`;
}

function writePendingCanvasSync(snapshot: PendingCanvasSyncSnapshot) {
  try {
    localStorage.setItem(
      pendingCanvasSyncKey(snapshot.userId, snapshot.canvasId),
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore quota/storage access errors.
  }
}

function readPendingCanvasSync(key: string): PendingCanvasSyncSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCanvasSyncSnapshot;
    if (!parsed || !parsed.canvasId || !parsed.userId || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.drawings) || !parsed.pan || typeof parsed.zoom !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function removePendingCanvasSync(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors.
  }
}

function listPendingCanvasSyncKeysForUser(userId: string) {
  try {
    const prefix = `${PENDING_CANVAS_SYNC_KEY_PREFIX}${userId}_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function joinedCanvasAccessKey(userId: string) {
  return `${JOINED_CANVAS_ACCESS_KEY_PREFIX}${userId}`;
}

function readJoinedCanvasAccess(userId: string): JoinedCanvasAccessMap {
  try {
    const raw = localStorage.getItem(joinedCanvasAccessKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const next: JoinedCanvasAccessMap = {};
    Object.entries(parsed || {}).forEach(([canvasId, value]) => {
      if (!canvasId) return;
      next[canvasId] = value === 'editor' ? 'editor' : 'viewer';
    });
    return next;
  } catch {
    return {};
  }
}

function writeJoinedCanvasAccess(userId: string, map: JoinedCanvasAccessMap) {
  try {
    localStorage.setItem(joinedCanvasAccessKey(userId), JSON.stringify(map));
  } catch {
    // Ignore storage access errors.
  }
}

function isCanvasNameConflictError(error: any) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return status === 409 || code === '23505' || message.includes('canvases_user_id_name_key') || message.includes('duplicate key');
}

function withCanvasNameAttempt(baseName: string, attempt: number) {
  if (attempt <= 0) return baseName;
  const parsed = parseCanvasRouteName(baseName);
  return `${parsed.canvasSlug}-${attempt + 1}/${parsed.pageSlug}`;
}

function isPermissionDeniedError(error: any) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').trim();
  return status === 401 || status === 403 || code === '42501';
}

function isRpcMissingError(error: any) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42883' || message.includes('function') && message.includes('does not exist');
}

export function useCanvasSync(session: Session | null, options?: UseCanvasSyncOptions) {
  const enabled = options?.enabled ?? true;
  const canvasIdRef = useRef<string | null>(null);
  const currentCanvasIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const guestSaveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastGuestSignatureRef = useRef('');
  const pendingSyncCacheRef = useRef<Record<string, PendingCanvasSyncSnapshot>>({});
  const blockedWriteCanvasIdsRef = useRef<Set<string>>(new Set());
  const permissionWarningShownRef = useRef(false);
  const isFlushingRemoteRef = useRef(false);
  const isLoadingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [sharedCanvases, setSharedCanvases] = useState<CanvasMeta[]>([]);
  const [shareAccessByCanvasId, setShareAccessByCanvasId] = useState<Record<string, CanvasAccessLevel>>({});
  const [joinedCanvasAccessByCanvasId, setJoinedCanvasAccessByCanvasId] = useState<JoinedCanvasAccessMap>({});
  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
  const [currentCanvasName, setCurrentCanvasName] = useState<string | null>(null);
  const [isCanvasLoading, setIsCanvasLoading] = useState(true);

  const warnPermissionIssue = useCallback(() => {
    if (permissionWarningShownRef.current) return;
    permissionWarningShownRef.current = true;
    toast.error('Supabase permission error (403). Apply latest DB migrations and sign in again.');
  }, []);

  const canWriteCanvas = useCallback((canvasId: string) => {
    if (!canvasId) return false;
    if (blockedWriteCanvasIdsRef.current.has(canvasId)) return false;
    if (canvases.some((canvas) => canvas.id === canvasId)) return true;
    if (shareAccessByCanvasId[canvasId] === 'editor') return true;
    return false;
  }, [canvases, shareAccessByCanvasId]);

  const insertCanvasWithRetry = useCallback(async (
    userId: string,
    baseName: string,
    payload?: Partial<{
      blocks: CanvasBlock[];
      drawings: DrawingElement[];
      pan_x: number;
      pan_y: number;
      zoom: number;
    }>,
    mutateNameOnConflict = true
  ) => {
    const rpc = await (supabase as any).rpc('create_canvas_with_unique_name', {
      p_name: baseName,
      p_blocks: payload?.blocks || [],
      p_drawings: payload?.drawings || [],
      p_pan_x: payload?.pan_x ?? 0,
      p_pan_y: payload?.pan_y ?? 0,
      p_zoom: payload?.zoom ?? 1,
    });
    const rpcRow = Array.isArray(rpc?.data) ? rpc.data[0] : rpc?.data;
    if (rpcRow?.id) {
      return rpcRow as any;
    }

    if (isPermissionDeniedError(rpc?.error)) {
      warnPermissionIssue();
      return null;
    }

    const maxAttempts = mutateNameOnConflict ? 6 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateName = mutateNameOnConflict ? withCanvasNameAttempt(baseName, attempt) : baseName;
      const { data, error } = await supabase
        .from('canvases')
        .insert({
          user_id: userId,
          name: candidateName,
          blocks: payload?.blocks || [],
          drawings: payload?.drawings || [],
          pan_x: payload?.pan_x ?? 0,
          pan_y: payload?.pan_y ?? 0,
          zoom: payload?.zoom ?? 1,
        } as any)
        .select('id,name,updated_at')
        .single();

      if (data?.id) return data as any;
      if (!error) continue;
      const status = Number((error as any)?.status || 0);
      if (status === 401 || status === 403 || String((error as any)?.code || '') === '42501') {
        warnPermissionIssue();
      }
      if (!mutateNameOnConflict || !isCanvasNameConflictError(error)) {
        return null;
      }
    }
    return null;
  }, [warnPermissionIssue]);

  const refreshCanvases = useCallback(async (userId: string) => {
    const { data, error, status } = await supabase
      .from('canvases')
      .select('id,name,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) {
      if (status === 401 || status === 403) {
        // Keep prior local list and let auth/session recovery handle access restoration.
        warnPermissionIssue();
        return null;
      }
      return null;
    }
    setCanvases((data || []) as CanvasMeta[]);
    return (data || []) as CanvasMeta[];
  }, [warnPermissionIssue]);

  const refreshSharedCanvases = useCallback(async (userId: string) => {
    const joinedAccess = readJoinedCanvasAccess(userId);
    const joinedIds = Object.keys(joinedAccess);
    setJoinedCanvasAccessByCanvasId(joinedAccess);

    if (!joinedIds.length) {
      setSharedCanvases([]);
      return [] as CanvasMeta[];
    }

    const { data, error, status } = await supabase
      .from('canvases')
      .select('id,name,updated_at,user_id')
      .in('id', joinedIds)
      .neq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      if (status === 401 || status === 403) {
        warnPermissionIssue();
        return null;
      }
      return null;
    }

    const mapped = ((data || []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      updated_at: row.updated_at,
    })) as CanvasMeta[];

    const validIds = new Set(mapped.map((row) => row.id));
    const nextJoined: JoinedCanvasAccessMap = {};
    Object.entries(joinedAccess).forEach(([canvasId, access]) => {
      if (!validIds.has(canvasId)) return;
      nextJoined[canvasId] = access;
    });

    setJoinedCanvasAccessByCanvasId(nextJoined);
    writeJoinedCanvasAccess(userId, nextJoined);
    setSharedCanvases(mapped);
    return mapped;
  }, [warnPermissionIssue]);

  const refreshShareAccessByCanvasIds = useCallback(async (canvasIds: string[]) => {
    if (!canvasIds.length) {
      setShareAccessByCanvasId({});
      return {} as Record<string, 'viewer' | 'editor'>;
    }

    const { data, error, status } = await supabase
      .from('shared_canvases')
      .select('canvas_id,access_level')
      .in('canvas_id', canvasIds);

    if (error) {
      if (status === 401 || status === 403) {
        warnPermissionIssue();
      }
      return {} as Record<string, 'viewer' | 'editor'>;
    }

    const next: Record<string, 'viewer' | 'editor'> = {};
    (data || []).forEach((row: any) => {
      const id = String(row?.canvas_id || '').trim();
      const level = String(row?.access_level || '').toLowerCase();
      if (!id) return;
      if (level === 'editor') {
        next[id] = 'editor';
      } else if (level === 'viewer') {
        next[id] = 'viewer';
      }
    });
    setShareAccessByCanvasId(next);
    return next;
  }, [warnPermissionIssue]);

  const refreshAllCanvasCollections = useCallback(async (userId: string) => {
    const [owned, shared] = await Promise.all([
      refreshCanvases(userId),
      refreshSharedCanvases(userId),
    ]);

    const ids = [
      ...((owned || []).map((canvas) => canvas.id)),
      ...((shared || []).map((canvas) => canvas.id)),
    ];
    await refreshShareAccessByCanvasIds(ids);
    return { owned, shared };
  }, [refreshCanvases, refreshShareAccessByCanvasIds, refreshSharedCanvases]);

  const markJoinedCanvasAccess = useCallback((canvasId: string, access: CanvasAccessLevel) => {
    const userId = session?.user?.id;
    if (!userId || !canvasId) return;

    setJoinedCanvasAccessByCanvasId((prev) => {
      const existing = prev[canvasId];
      const nextAccess: CanvasAccessLevel = (existing === 'editor' || access === 'editor') ? 'editor' : 'viewer';
      const next = { ...prev, [canvasId]: nextAccess };
      writeJoinedCanvasAccess(userId, next);
      return next;
    });
  }, [session?.user?.id]);

  const removeJoinedCanvasAccess = useCallback((userId: string, canvasId: string) => {
    if (!userId || !canvasId) return;
    setJoinedCanvasAccessByCanvasId((prev) => {
      if (!prev[canvasId]) return prev;
      const next = { ...prev };
      delete next[canvasId];
      writeJoinedCanvasAccess(userId, next);
      return next;
    });
    setSharedCanvases((prev) => prev.filter((canvas) => canvas.id !== canvasId));
  }, []);

  const loadCanvasById = useCallback(async (canvasId: string, persistForUserId?: string): Promise<boolean> => {
    const seq = ++loadSeqRef.current;
    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    try {
      const rpc = await (supabase as any).rpc('get_canvas_for_user', {
        p_canvas_id: canvasId,
      });

      let data: any[] | null = Array.isArray(rpc?.data)
        ? rpc.data
        : (rpc?.data ? [rpc.data] : []);
      let error: any = rpc?.error || null;
      let status = Number(error?.status || 0);

      if (error && isRpcMissingError(error)) {
        const fallback = await supabase
          .from('canvases')
          .select('*')
          .eq('id', canvasId)
          .limit(1);
        data = Array.isArray(fallback.data) ? fallback.data : [];
        error = fallback.error;
        status = Number((fallback as any)?.status || Number(error?.status || 0));
      }

      if (seq !== loadSeqRef.current) return false;

      if (error) {
        if (status === 401 || status === 403) {
          warnPermissionIssue();
        }
      }

      const row = Array.isArray(data) ? data[0] : null;

      if (!row) {
        if (persistForUserId) {
          removeJoinedCanvasAccess(persistForUserId, canvasId);
        }
        if (persistForUserId) {
          const { owned } = await refreshAllCanvasCollections(persistForUserId);
          if (seq !== loadSeqRef.current) return false;
          const fallback = (owned || [])[0];
          if (fallback?.id && fallback.id !== canvasId) {
            return await loadCanvasById(fallback.id, persistForUserId);
          }
        }
        if (currentCanvasIdRef.current === canvasId) {
          currentCanvasIdRef.current = null;
          canvasIdRef.current = null;
          setCurrentCanvasId(null);
          setCurrentCanvasName(null);
        }
        return false;
      }

      canvasIdRef.current = row.id;
      currentCanvasIdRef.current = row.id;
      setCurrentCanvasId(row.id);
      setCurrentCanvasName((row as any).name || null);
      if (persistForUserId) {
        writeLastOpenedCanvasId(persistForUserId, row.id);
      }
      const store = useCanvasStore.getState();
      const drawings = (row as any).drawings as DrawingElement[] || [];
      store.loadCanvas(
        (row.blocks as unknown as CanvasBlock[]) || [],
        { x: row.pan_x, y: row.pan_y },
        row.zoom,
        drawings
      );
      return true;
    } finally {
      isLoadingRef.current = false;
      if (seq === loadSeqRef.current) {
        setIsCanvasLoading(false);
      }
    }
  }, [refreshAllCanvasCollections, removeJoinedCanvasAccess, warnPermissionIssue]);

  const loadCanvas = useCallback(async (userId: string) => {
    const autoLoadSeq = ++loadSeqRef.current;
    const wasAutoLoadCancelled = () => loadSeqRef.current !== autoLoadSeq;

    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    const { owned: list } = await refreshAllCanvasCollections(userId);
    if (!list) {
      isLoadingRef.current = false;
      setIsCanvasLoading(false);
      return;
    }
    if (wasAutoLoadCancelled()) {
      isLoadingRef.current = false;
      return;
    }

    const savedId = readLastOpenedCanvasId(userId);
    const selectedDuringStartup = currentCanvasIdRef.current
      ? list.find((canvas) => canvas.id === currentCanvasIdRef.current)
      : null;
    const preferred = savedId ? list.find((canvas) => canvas.id === savedId) : null;
    const first = selectedDuringStartup || list[0] || preferred;
    const guestSnapshot = readGuestSnapshot();
    const hasGuestEdits = !isBlankSnapshot(guestSnapshot);

    if (!hasGuestEdits && guestSnapshot) {
      clearGuestSnapshot();
    }

    if (hasGuestEdits && guestSnapshot) {
      const canvasName = createDefaultCanvasRouteName();
      const importedCanvas = await insertCanvasWithRetry(
        userId,
        canvasName,
        {
          blocks: JSON.parse(JSON.stringify(guestSnapshot.blocks || [])),
          drawings: JSON.parse(JSON.stringify(guestSnapshot.drawings || [])),
          pan_x: guestSnapshot.pan.x,
          pan_y: guestSnapshot.pan.y,
          zoom: guestSnapshot.zoom,
        },
        true
      );
      if (importedCanvas?.id) {
        clearGuestSnapshot();
        await refreshAllCanvasCollections(userId);
        if (wasAutoLoadCancelled()) {
          isLoadingRef.current = false;
          return;
        }
        await loadCanvasById(importedCanvas.id, userId);
        isLoadingRef.current = false;
        setIsCanvasLoading(false);
        return;
      }
    }

    if (wasAutoLoadCancelled()) {
      isLoadingRef.current = false;
      return;
    }

    if (first?.id) {
      await loadCanvasById(first.id, userId);
      // Fix old default canvas name once, so URL stays in the new pattern.
      if (isLegacyUsernameCanvasName(first.name)) {
        const newName = createDefaultCanvasRouteName();
        const { error } = await supabase
          .from('canvases')
          .update({ name: newName })
          .eq('id', first.id);
        if (!error) {
          setCurrentCanvasName(newName);
          await refreshAllCanvasCollections(userId);
        }
      }
    } else {
      const canvasName = createDefaultCanvasRouteName();
      const newCanvas = await insertCanvasWithRetry(userId, canvasName, undefined, true);
      if (newCanvas) {
        canvasIdRef.current = newCanvas.id;
        currentCanvasIdRef.current = newCanvas.id;
        setCurrentCanvasId(newCanvas.id);
        writeLastOpenedCanvasId(userId, newCanvas.id);
        await refreshAllCanvasCollections(userId);
        await loadCanvasById(newCanvas.id, userId);
      } else {
        // Last-resort fallback for fresh accounts so login always lands on a valid page.
        const forcedName = `untitled-${Date.now()}/page-1.cnvs`;
        const forcedCanvas = await insertCanvasWithRetry(userId, forcedName, undefined, false);
        if (forcedCanvas?.id) {
          canvasIdRef.current = forcedCanvas.id;
          currentCanvasIdRef.current = forcedCanvas.id;
          setCurrentCanvasId(forcedCanvas.id);
          writeLastOpenedCanvasId(userId, forcedCanvas.id);
          await refreshAllCanvasCollections(userId);
          await loadCanvasById(forcedCanvas.id, userId);
        }
      }
    }
    isLoadingRef.current = false;
    setIsCanvasLoading(false);
  }, [loadCanvasById, refreshAllCanvasCollections]);

  const createCanvas = useCallback(async (name?: string) => {
    if (!enabled || !session?.user?.id) return;
    const createSeq = ++loadSeqRef.current;
    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    const canvasName = name?.trim() || createDefaultCanvasRouteName();
    const newCanvas = await insertCanvasWithRetry(session.user.id, canvasName, undefined, !name?.trim());

    if (createSeq !== loadSeqRef.current) {
      isLoadingRef.current = false;
      setIsCanvasLoading(false);
      return;
    }

    if (newCanvas?.id) {
      const now = new Date().toISOString();
      canvasIdRef.current = newCanvas.id;
      currentCanvasIdRef.current = newCanvas.id;
      setCurrentCanvasId(newCanvas.id);
      setCurrentCanvasName(newCanvas.name || canvasName);
      writeLastOpenedCanvasId(session.user.id, newCanvas.id);
      useCanvasStore.getState().loadCanvas([], { x: 0, y: 0 }, 1, []);
      setCanvases((prev) => {
        const next = [{ id: newCanvas.id, name: newCanvas.name || canvasName, updated_at: newCanvas.updated_at || now }, ...prev.filter((c) => c.id !== newCanvas.id)];
        return next;
      });
      void refreshAllCanvasCollections(session.user.id);
    } else {
      toast.error('Failed to create a new canvas. Please try again.');
    }
    isLoadingRef.current = false;
    setIsCanvasLoading(false);
  }, [enabled, refreshAllCanvasCollections, session?.user?.id]);

  const selectCanvas = useCallback(async (canvasId: string): Promise<boolean> => {
    if (!enabled) return;
    return await loadCanvasById(canvasId, session?.user?.id);
  }, [enabled, loadCanvasById, session?.user?.id]);

  const selectCanvasByName = useCallback(async (name: string) => {
    if (!enabled || !session?.user?.id) return;
    const requestedSeq = loadSeqRef.current;
    const { data } = await supabase
      .from('canvases')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('name', name)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (requestedSeq !== loadSeqRef.current) return;
    if (data?.id) await loadCanvasById(data.id, session.user.id);
  }, [enabled, loadCanvasById, session?.user?.id]);

  const selectCanvasByRoute = useCallback(async (ownerUsername: string, name: string, pageName?: string) => {
    if (!enabled) return;
    const requestedSeq = loadSeqRef.current;
    let { data, error } = await supabase.rpc('resolve_user_canvas', {
      p_owner_username: ownerUsername,
      p_canvas_name: name,
      p_page_name: pageName || null,
    });
    if (error) {
      const fallback = await supabase.rpc('resolve_user_canvas', {
        p_owner_username: ownerUsername,
        p_canvas_name: name,
      });
      data = fallback.data;
      error = fallback.error;
    }
    if (requestedSeq !== loadSeqRef.current) return;
    if (!error && data) {
      await loadCanvasById(data as string, session?.user?.id);
    }
  }, [enabled, loadCanvasById, session?.user?.id]);

  const deleteCanvases = useCallback(async (ids: string[]) => {
    if (!enabled || !session?.user?.id) return;
    if (!ids.length) return;

    // Invalidate any in-flight loads/saves.
    loadSeqRef.current += 1;
    isLoadingRef.current = true;

    const { error } = await supabase
      .from('canvases')
      .delete()
      .in('id', ids);

    if (!error) {
      const { owned: list } = await refreshAllCanvasCollections(session.user.id);
      if (!list) {
        isLoadingRef.current = false;
        return;
      }
      const activeId = currentCanvasIdRef.current;
      const activeStillExists = activeId ? list.some((canvas) => canvas.id === activeId) : false;

      if (activeStillExists) {
        isLoadingRef.current = false;
        return;
      }

      const next = list[0];
      if (next?.id) {
        await loadCanvasById(next.id, session.user.id);
      } else {
        // No canvases left: create a new empty one in the usual pattern.
        await createCanvas();
      }
    }

    isLoadingRef.current = false;
  }, [createCanvas, enabled, loadCanvasById, refreshAllCanvasCollections, session?.user?.id]);

  const flushPendingCanvasSync = useCallback(async () => {
    if (!session?.user?.id) return;
    if (isFlushingRemoteRef.current) return;

    const userId = session.user.id;
    const inMemoryPending = Object.values(pendingSyncCacheRef.current)
      .filter((item) => item.userId === userId);
    const keys = listPendingCanvasSyncKeysForUser(userId);
    if (!keys.length && !inMemoryPending.length) return;

    const mergedByCanvasId = new Map<string, PendingCanvasSyncSnapshot>();
    for (const item of inMemoryPending) {
      mergedByCanvasId.set(item.canvasId, item);
    }
    for (const key of keys) {
      const pendingFromStorage = readPendingCanvasSync(key);
      if (!pendingFromStorage) {
        removePendingCanvasSync(key);
        continue;
      }
      const existing = mergedByCanvasId.get(pendingFromStorage.canvasId);
      if (!existing || Date.parse(existing.updatedAt) <= Date.parse(pendingFromStorage.updatedAt)) {
        mergedByCanvasId.set(pendingFromStorage.canvasId, pendingFromStorage);
      }
    }

    const pendingEntries = Array.from(mergedByCanvasId.values()).sort(
      (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
    );
    if (!pendingEntries.length) return;

    isFlushingRemoteRef.current = true;
    const batchStart = performance.now();
    let successCount = 0;
    let errorCount = 0;
    try {
      for (const pending of pendingEntries) {
        if (!canWriteCanvas(pending.canvasId)) {
          delete pendingSyncCacheRef.current[pending.canvasId];
          removePendingCanvasSync(pendingCanvasSyncKey(userId, pending.canvasId));
          continue;
        }

        const requestStart = performance.now();
        const { error } = await supabase
          .from('canvases')
          .update({
            blocks: pending.blocks,
            drawings: pending.drawings,
            pan_x: pending.pan.x,
            pan_y: pending.pan.y,
            zoom: pending.zoom,
          } as any)
          .eq('id', pending.canvasId);

        const requestDurationMs = performance.now() - requestStart;
        const queuedAtMs = typeof pending.queuedAtMs === 'number'
          ? pending.queuedAtMs
          : Date.parse(pending.updatedAt);
        const queueDelayMs = Number.isFinite(queuedAtMs)
          ? Math.max(0, Date.now() - queuedAtMs)
          : 0;

        if (!error) {
          successCount += 1;
          delete pendingSyncCacheRef.current[pending.canvasId];
          removePendingCanvasSync(pendingCanvasSyncKey(userId, pending.canvasId));
          setCanvases((prev) => prev.map((c) => (
            c.id === pending.canvasId
              ? { ...c, updated_at: pending.updatedAt }
              : c
          )));
          recordPerfMetric('autosave_flush_success', requestDurationMs, {
            queue_delay_ms: Math.round(queueDelayMs),
            blocks: pending.blocks.length,
            drawings: pending.drawings.length,
          });
        } else {
          errorCount += 1;
          if (isPermissionDeniedError(error)) {
            warnPermissionIssue();
            blockedWriteCanvasIdsRef.current.add(pending.canvasId);
            delete pendingSyncCacheRef.current[pending.canvasId];
            removePendingCanvasSync(pendingCanvasSyncKey(userId, pending.canvasId));
          } else {
            // Persist failed network sync for retry across reloads.
            pendingSyncCacheRef.current[pending.canvasId] = pending;
            writePendingCanvasSync(pending);
          }
          recordPerfMetric('autosave_flush_error', requestDurationMs, {
            queue_delay_ms: Math.round(queueDelayMs),
            message: error.message || 'unknown',
          });
        }
      }
      recordPerfMetric('autosave_flush_batch', performance.now() - batchStart, {
        size: pendingEntries.length,
        success: successCount,
        error: errorCount,
      });
    } finally {
      isFlushingRemoteRef.current = false;
    }
  }, [canWriteCanvas, session?.user?.id, warnPermissionIssue]);

  const persistInMemoryPendingSync = useCallback(() => {
    const entries = Object.values(pendingSyncCacheRef.current);
    for (const snapshot of entries) {
      writePendingCanvasSync(snapshot);
    }
  }, []);

  const renameCanvas = useCallback(async (nextCanvasName: string) => {
    if (!session?.user?.id || !currentCanvasIdRef.current || !currentCanvasName) return false;

    const currentParsed = parseCanvasRouteName(currentCanvasName);
    const nextCanvasSlug = parseCanvasRouteName(`${nextCanvasName}/${currentParsed.pageSlug}`).canvasSlug;
    if (nextCanvasSlug === currentParsed.canvasSlug) return true;

    const { data: allRows } = await supabase
      .from('canvases')
      .select('id,name')
      .eq('user_id', session.user.id);

    const all = (allRows || []) as { id: string; name: string }[];
    const targetRows = all.filter((row) => parseCanvasRouteName(row.name).canvasSlug === currentParsed.canvasSlug);
    if (!targetRows.length) return false;

    const updates = targetRows.map((row) => {
      const parsed = parseCanvasRouteName(row.name);
      return { id: row.id, name: toCanvasRouteName(nextCanvasSlug, parsed.pageSlug) };
    });

    const targetIds = new Set(updates.map((row) => row.id));
    const targetNames = new Set(updates.map((row) => row.name));
    const conflict = all.some((row) => !targetIds.has(row.id) && targetNames.has(row.name));
    if (conflict) {
      toast.error('Canvas rename conflicts with existing page names');
      return false;
    }

    for (const row of updates) {
      const { error } = await supabase
        .from('canvases')
        .update({ name: row.name })
        .eq('id', row.id);
      if (error) {
        toast.error('Failed to rename canvas');
        return false;
      }
    }

    const currentRenamed = updates.find((row) => row.id === currentCanvasIdRef.current);
    if (currentRenamed) {
      setCurrentCanvasName(currentRenamed.name);
    }
    await refreshAllCanvasCollections(session.user.id);
    toast.success('Canvas renamed');
    return true;
  }, [currentCanvasName, refreshAllCanvasCollections, session?.user?.id]);

  const renamePage = useCallback(async (nextPageName: string) => {
    if (!session?.user?.id || !currentCanvasIdRef.current || !currentCanvasName) return false;

    const currentParsed = parseCanvasRouteName(currentCanvasName);
    const nextName = toCanvasRouteName(currentParsed.canvasSlug, nextPageName);
    if (nextName === currentCanvasName) return true;

    const { data: conflictRow } = await supabase
      .from('canvases')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('name', nextName)
      .neq('id', currentCanvasIdRef.current)
      .maybeSingle();

    if (conflictRow?.id) {
      toast.error('Page name already exists in this canvas');
      return false;
    }

    const { error } = await supabase
      .from('canvases')
      .update({ name: nextName })
      .eq('id', currentCanvasIdRef.current);

    if (error) {
      toast.error('Failed to rename page');
      return false;
    }

    setCurrentCanvasName(nextName);
    await refreshAllCanvasCollections(session.user.id);
    toast.success('Page renamed');
    return true;
  }, [currentCanvasName, refreshAllCanvasCollections, session?.user?.id]);

  const saveCanvas = useCallback(() => {
    if (!session?.user?.id || !canvasIdRef.current || isLoadingRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      const canvasId = canvasIdRef.current;
      if (!canvasId) return;
      if (!canWriteCanvas(canvasId)) return;

      pendingSyncCacheRef.current[canvasId] = {
        userId: session.user.id,
        canvasId,
        blocks: blocks as CanvasBlock[],
        drawings: drawingElements as DrawingElement[],
        pan,
        zoom,
        queuedAtMs: Date.now(),
        updatedAt: new Date().toISOString(),
      };
    }, 320);
  }, [canWriteCanvas, session]);

  const saveGuestCanvas = useCallback(() => {
    if (session?.user?.id || isLoadingRef.current) return;
    if (guestSaveTimeoutRef.current) clearTimeout(guestSaveTimeoutRef.current);
    guestSaveTimeoutRef.current = setTimeout(() => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      const blocksPayload = JSON.parse(JSON.stringify(blocks));
      const drawingsPayload = JSON.parse(JSON.stringify(drawingElements));
      const signature = JSON.stringify([blocksPayload, drawingsPayload, pan.x, pan.y, zoom]);
      if (signature === lastGuestSignatureRef.current) {
        return;
      }

      writeGuestSnapshot({
        blocks: blocksPayload,
        drawings: drawingsPayload,
        pan,
        zoom,
      });
      lastGuestSignatureRef.current = signature;
    }, 700);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!enabled) {
      setIsCanvasLoading(false);
      return;
    }

    blockedWriteCanvasIdsRef.current.clear();

    if (session?.user?.id) {
      loadCanvas(session.user.id);
    } else {
      canvasIdRef.current = null;
      currentCanvasIdRef.current = null;
      setCurrentCanvasId(null);
      setCurrentCanvasName(null);
      blockedWriteCanvasIdsRef.current.clear();
      setCanvases([]);
      setSharedCanvases([]);
      setShareAccessByCanvasId({});
      setJoinedCanvasAccessByCanvasId({});
      const guestSnapshot = readGuestSnapshot();
      if (guestSnapshot) {
        useCanvasStore.getState().loadCanvas(
          guestSnapshot.blocks || [],
          guestSnapshot.pan || { x: 0, y: 0 },
          typeof guestSnapshot.zoom === 'number' ? guestSnapshot.zoom : 1,
          guestSnapshot.drawings || []
        );
      } else {
        useCanvasStore.getState().loadCanvas([], { x: 0, y: 0 }, 1);
      }
      setIsCanvasLoading(false);
    }
  }, [enabled, session?.user?.id, loadCanvas]);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;
    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (
        state.blocks === prevState.blocks &&
        state.drawingElements === prevState.drawingElements &&
        state.pan === prevState.pan &&
        state.zoom === prevState.zoom
      ) {
        return;
      }
      saveCanvas();
    });
    return () => unsub();
  }, [enabled, session?.user?.id, saveCanvas]);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;

    void flushPendingCanvasSync();

    const intervalId = window.setInterval(() => {
      void flushPendingCanvasSync();
    }, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistInMemoryPendingSync();
        void flushPendingCanvasSync();
      }
    };

    const onBeforeUnload = () => {
      persistInMemoryPendingSync();
      void flushPendingCanvasSync();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [enabled, flushPendingCanvasSync, persistInMemoryPendingSync, session?.user?.id]);

  useEffect(() => {
    if (!enabled || session?.user?.id) return;
    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (
        state.blocks === prevState.blocks &&
        state.drawingElements === prevState.drawingElements &&
        state.pan === prevState.pan &&
        state.zoom === prevState.zoom
      ) {
        return;
      }
      saveGuestCanvas();
    });
    return () => unsub();
  }, [enabled, session?.user?.id, saveGuestCanvas]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (guestSaveTimeoutRef.current) clearTimeout(guestSaveTimeoutRef.current);
      persistInMemoryPendingSync();
      void flushPendingCanvasSync();
    };
  }, [flushPendingCanvasSync, persistInMemoryPendingSync]);

  return {
    canvasId: canvasIdRef.current,
    currentCanvasId,
    currentCanvasName,
    canvases,
    sharedCanvases,
    shareAccessByCanvasId,
    joinedCanvasAccessByCanvasId,
    markJoinedCanvasAccess,
    selectCanvas,
    selectCanvasByName,
    selectCanvasByRoute,
    createCanvas,
    deleteCanvases,
    renameCanvas,
    renamePage,
    isCanvasLoading,
  };
}
