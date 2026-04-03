import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { useThemeTime } from '@/hooks/useThemeTime';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

export default function SharedCanvas() {
  useThemeTime();
  const { token, username, canvasName, pageName } = useParams<{ token?: string; username?: string; canvasName?: string; pageName?: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { zoom, setZoom, setPan } = useCanvasStore();

  useEffect(() => {
    const load = async () => {
      let canvasId: string | null = null;

      if (token) {
        const { data: shared } = await supabase
          .from('shared_canvases')
          .select('canvas_id')
          .eq('share_token', token)
          .single();
        canvasId = shared?.canvas_id || null;
      } else if (canvasName && username) {
        const decodedCanvasName = decodeURIComponent(canvasName);
        const decodedPageName = pageName ? decodeURIComponent(pageName) : null;
        const normalizedOwner = decodeURIComponent(username).toLowerCase();
        let { data: resolvedByRoute } = await supabase.rpc('resolve_shared_canvas', {
          p_owner_username: normalizedOwner,
          p_canvas_name: decodedCanvasName,
          p_page_name: decodedPageName,
        });
        if (!resolvedByRoute) {
          const fallback = await supabase.rpc('resolve_shared_canvas', {
            p_owner_username: normalizedOwner,
            p_canvas_name: decodedCanvasName,
          });
          resolvedByRoute = fallback.data;
        }

        if (resolvedByRoute) {
          canvasId = resolvedByRoute as string;
        } else {
          let { data: resolvedByUserCanvas } = await supabase.rpc('resolve_user_canvas', {
            p_owner_username: normalizedOwner,
            p_canvas_name: decodedCanvasName,
            p_page_name: decodedPageName,
          });
          if (!resolvedByUserCanvas) {
            const fallback = await supabase.rpc('resolve_user_canvas', {
              p_owner_username: normalizedOwner,
              p_canvas_name: decodedCanvasName,
            });
            resolvedByUserCanvas = fallback.data;
          }

          if (resolvedByUserCanvas) {
            canvasId = resolvedByUserCanvas as string;
          } else {
            let sharedQuery = supabase
              .from('shared_canvases')
              .select('canvas_id')
              .eq('owner_username', normalizedOwner)
              .eq('canvas_name', decodedCanvasName);
            if (decodedPageName) {
              sharedQuery = sharedQuery.eq('page_name', decodedPageName);
            }
            const { data: sharedByRoute } = await sharedQuery.maybeSingle();
            canvasId = sharedByRoute?.canvas_id || null;
          }
        }
      }

      if (!canvasId) {
        setError('Canvas not found or link expired');
        setLoading(false);
        return;
      }

      const { data: canvas } = await supabase
        .from('canvases')
        .select('*')
        .eq('id', canvasId)
        .single();

      if (!canvas) {
        setError('Canvas not found');
        setLoading(false);
        return;
      }

      useCanvasStore.getState().loadCanvas(
        (canvas.blocks as unknown as CanvasBlock[]) || [],
        { x: canvas.pan_x, y: canvas.pan_y },
        canvas.zoom
      );
      setLoading(false);
    };

    load();
  }, [token, username, canvasName, pageName]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <span className="text-sm font-mono text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <span className="text-sm font-mono text-muted-foreground">{error}</span>
      </div>
    );
  }

  return (
    <>
      <InfiniteCanvas readOnly />

      {/* View-only badge */}
      <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
        <div className="w-7 h-7 bg-foreground flex items-center justify-center">
          <span className="text-background text-xs font-bold font-mono">C</span>
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground font-mono">CNVS</span>
        <span className="text-[10px] font-mono text-muted-foreground border border-border px-2 py-0.5">
          VIEW ONLY
        </span>
      </div>

      {/* Minimal zoom controls */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-px border border-border bg-card">
        <button className="inline-flex items-center justify-center w-10 h-10 hover:bg-accent transition-colors" onClick={() => setZoom(zoom - 0.15)}>
          <ZoomOut size={16} />
        </button>
        <span className="text-[10px] font-mono text-muted-foreground w-10 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button className="inline-flex items-center justify-center w-10 h-10 hover:bg-accent transition-colors" onClick={() => setZoom(zoom + 0.15)}>
          <ZoomIn size={16} />
        </button>
        <button className="inline-flex items-center justify-center w-10 h-10 hover:bg-accent transition-colors border-l border-border" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
          <Maximize size={16} />
        </button>
      </div>
    </>
  );
}
