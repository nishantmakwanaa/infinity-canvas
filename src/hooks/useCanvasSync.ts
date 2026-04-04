import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, CanvasBlock, DrawingElement } from '@/store/canvasStore';
import type { Session } from '@supabase/supabase-js';
import { createDefaultCanvasRouteName, parseCanvasRouteName, toCanvasRouteName } from '@/lib/canvasNaming';
import { toast } from 'sonner';

export interface CanvasMeta {
  id: string;
  name: string;
  updated_at: string;
}

interface UseCanvasSyncOptions {
  enabled?: boolean;
}

const GUEST_CANVAS_STORAGE_KEY = 'cnvs_guest_canvas_v1';
const LAST_OPENED_CANVAS_KEY_PREFIX = 'cnvs_last_opened_canvas_v1_';
const PENDING_CANVAS_SYNC_KEY_PREFIX = 'cnvs_pending_canvas_sync_v1_';

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
  signature: string;
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
    if (!parsed || !parsed.canvasId || !parsed.userId || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.drawings) || !parsed.pan || typeof parsed.zoom !== 'number' || typeof parsed.signature !== 'string') {
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

export function useCanvasSync(session: Session | null, options?: UseCanvasSyncOptions) {
  const enabled = options?.enabled ?? true;
  const canvasIdRef = useRef<string | null>(null);
  const currentCanvasIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const guestSaveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedSignatureRef = useRef('');
  const lastGuestSignatureRef = useRef('');
  const isFlushingRemoteRef = useRef(false);
  const isLoadingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
  const [currentCanvasName, setCurrentCanvasName] = useState<string | null>(null);
  const [isCanvasLoading, setIsCanvasLoading] = useState(true);

  const refreshCanvases = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('canvases')
      .select('id,name,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    setCanvases((data || []) as CanvasMeta[]);
    return (data || []) as CanvasMeta[];
  }, []);

  const loadCanvasById = useCallback(async (canvasId: string, persistForUserId?: string) => {
    const seq = ++loadSeqRef.current;
    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    try {
      const { data } = await supabase
        .from('canvases')
        .select('*')
        .eq('id', canvasId)
        .single();

      if (seq !== loadSeqRef.current) return;

      if (data) {
        canvasIdRef.current = data.id;
        currentCanvasIdRef.current = data.id;
        setCurrentCanvasId(data.id);
        setCurrentCanvasName((data as any).name || null);
        if (persistForUserId) {
          writeLastOpenedCanvasId(persistForUserId, data.id);
        }
        const store = useCanvasStore.getState();
        const drawings = (data as any).drawings as DrawingElement[] || [];
        store.loadCanvas(
          (data.blocks as unknown as CanvasBlock[]) || [],
          { x: data.pan_x, y: data.pan_y },
          data.zoom,
          drawings
        );
      }
    } finally {
      isLoadingRef.current = false;
      if (seq === loadSeqRef.current) {
        setIsCanvasLoading(false);
      }
    }
  }, []);

  const loadCanvas = useCallback(async (userId: string) => {
    const autoLoadSeq = ++loadSeqRef.current;
    const wasAutoLoadCancelled = () => loadSeqRef.current !== autoLoadSeq;

    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    const list = await refreshCanvases(userId);
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
      const { data: importedCanvas } = await supabase
        .from('canvases')
        .insert({
          user_id: userId,
          name: canvasName,
          blocks: JSON.parse(JSON.stringify(guestSnapshot.blocks || [])),
          drawings: JSON.parse(JSON.stringify(guestSnapshot.drawings || [])),
          pan_x: guestSnapshot.pan.x,
          pan_y: guestSnapshot.pan.y,
          zoom: guestSnapshot.zoom,
        } as any)
        .select('id')
        .single();
      if (importedCanvas?.id) {
        clearGuestSnapshot();
        await refreshCanvases(userId);
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
          await refreshCanvases(userId);
        }
      }
    } else {
      const canvasName = createDefaultCanvasRouteName();
      const { data: newCanvas } = await supabase
        .from('canvases')
        .insert({ user_id: userId, blocks: [], pan_x: 0, pan_y: 0, zoom: 1, name: canvasName })
        .select()
        .single();
      if (newCanvas) {
        canvasIdRef.current = newCanvas.id;
        currentCanvasIdRef.current = newCanvas.id;
        setCurrentCanvasId(newCanvas.id);
        writeLastOpenedCanvasId(userId, newCanvas.id);
        await refreshCanvases(userId);
        await loadCanvasById(newCanvas.id, userId);
      }
    }
    isLoadingRef.current = false;
    setIsCanvasLoading(false);
  }, [loadCanvasById, refreshCanvases]);

  const createCanvas = useCallback(async (name?: string) => {
    if (!enabled || !session?.user?.id) return;
    const createSeq = ++loadSeqRef.current;
    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    const canvasName = name?.trim() || createDefaultCanvasRouteName();
    const { data: newCanvas } = await supabase
      .from('canvases')
      .insert({ user_id: session.user.id, blocks: [], drawings: [], pan_x: 0, pan_y: 0, zoom: 1, name: canvasName })
      .select('id,name,updated_at')
      .single();

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
      void refreshCanvases(session.user.id);
    }
    isLoadingRef.current = false;
    setIsCanvasLoading(false);
  }, [enabled, refreshCanvases, session?.user?.id]);

  const selectCanvas = useCallback(async (canvasId: string) => {
    if (!enabled) return;
    await loadCanvasById(canvasId, session?.user?.id);
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
      const list = await refreshCanvases(session.user.id);
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
  }, [createCanvas, enabled, loadCanvasById, refreshCanvases, session?.user?.id]);

  const flushPendingCanvasSync = useCallback(async () => {
    if (!session?.user?.id) return;
    if (isFlushingRemoteRef.current) return;

    const userId = session.user.id;
    const keys = listPendingCanvasSyncKeysForUser(userId);
    if (!keys.length) return;

    isFlushingRemoteRef.current = true;
    try {
      for (const key of keys) {
        const pending = readPendingCanvasSync(key);
        if (!pending) {
          removePendingCanvasSync(key);
          continue;
        }

        const { error } = await supabase
          .from('canvases')
          .update({
            blocks: pending.blocks,
            drawings: pending.drawings,
            pan_x: pending.pan.x,
            pan_y: pending.pan.y,
            zoom: pending.zoom,
          } as any)
          .eq('id', pending.canvasId)
          .eq('user_id', userId);

        if (!error) {
          removePendingCanvasSync(key);
          if (pending.canvasId === canvasIdRef.current) {
            lastSavedSignatureRef.current = pending.signature;
          }
          setCanvases((prev) => prev.map((c) => (
            c.id === pending.canvasId
              ? { ...c, updated_at: pending.updatedAt }
              : c
          )));
        }
      }
    } finally {
      isFlushingRemoteRef.current = false;
    }
  }, [session?.user?.id]);

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
    await refreshCanvases(session.user.id);
    toast.success('Canvas renamed');
    return true;
  }, [currentCanvasName, refreshCanvases, session?.user?.id]);

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
    await refreshCanvases(session.user.id);
    toast.success('Page renamed');
    return true;
  }, [currentCanvasName, refreshCanvases, session?.user?.id]);

  const saveCanvas = useCallback(() => {
    if (!session?.user?.id || !canvasIdRef.current || isLoadingRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      const blocksPayload = JSON.parse(JSON.stringify(blocks));
      const drawingsPayload = JSON.parse(JSON.stringify(drawingElements));
      const signature = JSON.stringify([blocksPayload, drawingsPayload, pan.x, pan.y, zoom]);
      if (signature === lastSavedSignatureRef.current) {
        return;
      }

      writePendingCanvasSync({
        userId: session.user.id,
        canvasId: canvasIdRef.current!,
        blocks: blocksPayload,
        drawings: drawingsPayload,
        pan,
        zoom,
        signature,
        updatedAt: new Date().toISOString(),
      });
    }, 320);
  }, [session]);

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

    if (session?.user?.id) {
      loadCanvas(session.user.id);
    } else {
      canvasIdRef.current = null;
      currentCanvasIdRef.current = null;
      setCurrentCanvasId(null);
      setCurrentCanvasName(null);
      setCanvases([]);
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
    const unsub = useCanvasStore.subscribe(() => {
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
        void flushPendingCanvasSync();
      }
    };

    const onBeforeUnload = () => {
      void flushPendingCanvasSync();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [enabled, flushPendingCanvasSync, session?.user?.id]);

  useEffect(() => {
    if (!enabled || session?.user?.id) return;
    const unsub = useCanvasStore.subscribe(() => {
      saveGuestCanvas();
    });
    return () => unsub();
  }, [enabled, session?.user?.id, saveGuestCanvas]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (guestSaveTimeoutRef.current) clearTimeout(guestSaveTimeoutRef.current);
      void flushPendingCanvasSync();
    };
  }, [flushPendingCanvasSync]);

  return {
    canvasId: canvasIdRef.current,
    currentCanvasId,
    currentCanvasName,
    canvases,
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
