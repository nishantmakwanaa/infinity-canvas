import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, CanvasBlock, DrawingElement } from '@/store/canvasStore';
import type { Session } from '@supabase/supabase-js';

export function useCanvasSync(session: Session | null, username?: string) {
  const canvasIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isLoadingRef = useRef(false);

  const loadCanvas = useCallback(async (userId: string, uname?: string) => {
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
      const drawings = (data as any).drawings as DrawingElement[] || [];
      store.loadCanvas(
        (data.blocks as unknown as CanvasBlock[]) || [],
        { x: data.pan_x, y: data.pan_y },
        data.zoom,
        drawings
      );
      // Update canvas name with username
      if (uname) {
        const canvasName = `${uname}'s Canvas`;
        if (data.name !== canvasName) {
          await supabase
            .from('canvases')
            .update({ name: canvasName })
            .eq('id', data.id);
        }
      }
    } else {
      const canvasName = uname ? `${uname}'s Canvas` : 'My Canvas';
      const { data: newCanvas } = await supabase
        .from('canvases')
        .insert({ user_id: userId, blocks: [], pan_x: 0, pan_y: 0, zoom: 1, name: canvasName })
        .select()
        .single();
      if (newCanvas) {
        canvasIdRef.current = newCanvas.id;
      }
    }
    isLoadingRef.current = false;
  }, []);

  const saveCanvas = useCallback(() => {
    if (!session?.user?.id || !canvasIdRef.current || isLoadingRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      await supabase
        .from('canvases')
        .update({
          blocks: JSON.parse(JSON.stringify(blocks)),
          drawings: JSON.parse(JSON.stringify(drawingElements)),
          pan_x: pan.x,
          pan_y: pan.y,
          zoom,
        } as any)
        .eq('id', canvasIdRef.current!);
    }, 1000);
  }, [session]);

  useEffect(() => {
    if (session?.user?.id) {
      loadCanvas(session.user.id, username);
    } else {
      canvasIdRef.current = null;
      useCanvasStore.getState().loadCanvas([], { x: 0, y: 0 }, 1);
    }
  }, [session?.user?.id, username, loadCanvas]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const unsub = useCanvasStore.subscribe(() => {
      saveCanvas();
    });
    return () => unsub();
  }, [session?.user?.id, saveCanvas]);

  return { canvasId: canvasIdRef.current };
}
