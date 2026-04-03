import { Pencil } from 'lucide-react';
import type { CanvasMeta } from '@/hooks/useCanvasSync';

interface CanvasSidebarProps {
  loggedInUserId: string | null;
  canvases: CanvasMeta[];
  currentCanvasId: string | null;
  onCreateCanvas: () => void;
  onSelectCanvas: (id: string) => void;
}

export function CanvasSidebar({
  loggedInUserId,
  canvases,
  currentCanvasId,
  onCreateCanvas,
  onSelectCanvas,
}: CanvasSidebarProps) {
  if (!loggedInUserId) return null;

  return (
    <aside className="fixed left-4 top-16 bottom-4 z-[60] w-64 border border-border bg-card/95 backdrop-blur-sm">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-mono text-foreground">Your Canvases</span>
        <button
          className="w-7 h-7 border border-border hover:bg-accent flex items-center justify-center"
          title="Create new canvas"
          onClick={onCreateCanvas}
        >
          <Pencil size={13} />
        </button>
      </div>
      <div className="p-2 space-y-1 overflow-auto h-[calc(100%-44px)]">
        {canvases.length === 0 && (
          <div className="text-[11px] font-mono text-muted-foreground px-1 py-2">No canvases yet</div>
        )}
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            className={`w-full text-left px-2 py-2 border text-xs font-mono transition-colors ${
              currentCanvasId === canvas.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card border-border hover:bg-accent'
            }`}
            onClick={() => onSelectCanvas(canvas.id)}
          >
            <div className="truncate">{canvas.name || 'Untitled Canvas'}</div>
            <div className="text-[10px] opacity-70 mt-0.5">
              {new Date(canvas.updated_at).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
