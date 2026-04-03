import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, CanvasBlock, DrawingElement } from '@/store/canvasStore';
import type { Session } from '@supabase/supabase-js';

export interface CanvasMeta {
  id: string;
  name: string;
  updated_at: string;
}

const GUEST_CANVAS_STORAGE_KEY = 'cnvs_guest_canvas_v1';

interface LocalCanvasSnapshot {
  blocks: CanvasBlock[];
  drawings: DrawingElement[];
  pan: { x: number; y: number };
  zoom: number;
}

function formatDayTimeName(date = new Date()) {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const day = days[date.getDay()];
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day}-${hh}-${mm}`;
}

function isBlankSnapshot(snapshot: LocalCanvasSnapshot | null) {
  if (!snapshot) return true;
  const noBlocks = (snapshot.blocks || []).length === 0;
  const noDrawings = (snapshot.drawings || []).length === 0;
  const basePan = snapshot.pan?.x === 0 && snapshot.pan?.y === 0;
  const baseZoom = snapshot.zoom === 1;
  return noBlocks && noDrawings && basePan && baseZoom;
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

export function useCanvasSync(session: Session | null, username?: string) {
  const canvasIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isLoadingRef = useRef(false);
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
  const [currentCanvasName, setCurrentCanvasName] = useState<string | null>(null);

  const refreshCanvases = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('canvases')
      .select('id,name,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    setCanvases((data || []) as CanvasMeta[]);
    return (data || []) as CanvasMeta[];
  }, []);

  const loadCanvasById = useCallback(async (canvasId: string) => {
    isLoadingRef.current = true;
    const { data } = await supabase
      .from('canvases')
      .select('*')
      .eq('id', canvasId)
      .single();

    if (data) {
      canvasIdRef.current = data.id;
      setCurrentCanvasId(data.id);
      setCurrentCanvasName((data as any).name || null);
      const store = useCanvasStore.getState();
      const drawings = (data as any).drawings as DrawingElement[] || [];
      store.loadCanvas(
        (data.blocks as unknown as CanvasBlock[]) || [],
        { x: data.pan_x, y: data.pan_y },
        data.zoom,
        drawings
      );
    }
    isLoadingRef.current = false;
  }, []);

  const loadCanvas = useCallback(async (userId: string, uname?: string) => {
    isLoadingRef.current = true;
    const list = await refreshCanvases(userId);
    const first = list[0];
    const guestSnapshot = readGuestSnapshot();
    const hasGuestEdits = !isBlankSnapshot(guestSnapshot);

    if (hasGuestEdits && guestSnapshot) {
      const canvasName = formatDayTimeName();
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
        await loadCanvasById(importedCanvas.id);
        isLoadingRef.current = false;
        return;
      }
    }

    if (first?.id) {
      await loadCanvasById(first.id);
    } else {
      const canvasName = formatDayTimeName();
      const { data: newCanvas } = await supabase
        .from('canvases')
        .insert({ user_id: userId, blocks: [], pan_x: 0, pan_y: 0, zoom: 1, name: canvasName })
        .select()
        .single();
      if (newCanvas) {
        canvasIdRef.current = newCanvas.id;
        setCurrentCanvasId(newCanvas.id);
        await refreshCanvases(userId);
        await loadCanvasById(newCanvas.id);
      }
    }
    isLoadingRef.current = false;
  }, [loadCanvasById, refreshCanvases]);

  const createCanvas = useCallback(async (name?: string) => {
    if (!session?.user?.id) return;
    const canvasName = name?.trim() || formatDayTimeName();
    const { data: newCanvas } = await supabase
      .from('canvases')
      .insert({ user_id: session.user.id, blocks: [], drawings: [], pan_x: 0, pan_y: 0, zoom: 1, name: canvasName })
      .select('id')
      .single();
    if (newCanvas?.id) {
      await refreshCanvases(session.user.id);
      await loadCanvasById(newCanvas.id);
    }
  }, [loadCanvasById, refreshCanvases, session?.user?.id]);

  const selectCanvas = useCallback(async (canvasId: string) => {
    await loadCanvasById(canvasId);
  }, [loadCanvasById]);

  const selectCanvasByName = useCallback(async (name: string) => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('canvases')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('name', name)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) await loadCanvasById(data.id);
  }, [loadCanvasById, session?.user?.id]);

  const selectCanvasByRoute = useCallback(async (ownerUsername: string, name: string) => {
    const { data, error } = await supabase.rpc('resolve_user_canvas', {
      p_owner_username: ownerUsername,
      p_canvas_name: name,
    });
    if (!error && data) {
      await loadCanvasById(data as string);
    }
  }, [loadCanvasById]);

  const saveCanvas = useCallback(() => {
    if (!session?.user?.id || !canvasIdRef.current || isLoadingRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      const { error } = await supabase
        .from('canvases')
        .update({
          blocks: JSON.parse(JSON.stringify(blocks)),
          drawings: JSON.parse(JSON.stringify(drawingElements)),
          pan_x: pan.x,
          pan_y: pan.y,
          zoom,
        } as any)
        .eq('id', canvasIdRef.current!);
      if (!error) {
        setCanvases((prev) => {
          const now = new Date().toISOString();
          const next = prev.map((c) => c.id === canvasIdRef.current ? { ...c, updated_at: now } : c);
          next.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return next;
        });
      }
    }, 1000);
  }, [session]);

  const saveGuestCanvas = useCallback(() => {
    if (session?.user?.id || isLoadingRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      writeGuestSnapshot({
        blocks: JSON.parse(JSON.stringify(blocks)),
        drawings: JSON.parse(JSON.stringify(drawingElements)),
        pan,
        zoom,
      });
    }, 400);
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
      loadCanvas(session.user.id, username);
    } else {
      canvasIdRef.current = null;
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
    }
  }, [session?.user?.id, username, loadCanvas]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const unsub = useCanvasStore.subscribe(() => {
      saveCanvas();
    });
    return () => unsub();
  }, [session?.user?.id, saveCanvas]);

  useEffect(() => {
    if (session?.user?.id) return;
    const unsub = useCanvasStore.subscribe(() => {
      saveGuestCanvas();
    });
    return () => unsub();
  }, [session?.user?.id, saveGuestCanvas]);

  return {
    canvasId: canvasIdRef.current,
    currentCanvasId,
    currentCanvasName,
    canvases,
    selectCanvas,
    selectCanvasByName,
    selectCanvasByRoute,
    createCanvas,
  };
}
