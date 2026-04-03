import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import type { Session } from '@supabase/supabase-js';

export function useCanvasSync(session: Session | null) {
  const canvasIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isLoadingRef = useRef(false);

  // Load canvas from DB
  const loadCanvas = useCallback(async (userId: string) => {
    isLoadingRef.current = true;
    const { data, error } = await supabase
      .from('canvases')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (data && !error) {
      canvasIdRef.current = data.id;
      const store = useCanvasStore.getState();
      store.loadCanvas(
        (data.blocks as unknown as CanvasBlock[]) || [],
        { x: data.pan_x, y: data.pan_y },
        data.zoom
      );
    } else {
      // Create new canvas for user
      const { data: newCanvas } = await supabase
        .from('canvases')
        .insert({ user_id: userId, blocks: [], pan_x: 0, pan_y: 0, zoom: 1 })
        .select()
        .single();
      if (newCanvas) {
        canvasIdRef.current = newCanvas.id;
      }
    }
    isLoadingRef.current = false;
  }, []);

  // Save canvas to DB (debounced)
  const saveCanvas = useCallback(() => {
    if (!session?.user?.id || !canvasIdRef.current || isLoadingRef.current) return;
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const { blocks, pan, zoom } = useCanvasStore.getState();
      await supabase
        .from('canvases')
        .update({
          blocks: JSON.parse(JSON.stringify(blocks)),
          pan_x: pan.x,
          pan_y: pan.y,
          zoom,
        })
        .eq('id', canvasIdRef.current!);
    }, 1000);
  }, [session]);

  // Load on login
  useEffect(() => {
    if (session?.user?.id) {
      loadCanvas(session.user.id);
    } else {
      canvasIdRef.current = null;
      useCanvasStore.getState().loadCanvas([], { x: 0, y: 0 }, 1);
    }
  }, [session?.user?.id, loadCanvas]);

  // Subscribe to store changes and auto-save
  useEffect(() => {
    if (!session?.user?.id) return;
    const unsub = useCanvasStore.subscribe(() => {
      saveCanvas();
    });
    return () => unsub();
  }, [session?.user?.id, saveCanvas]);

  return { canvasId: canvasIdRef.current };
}
