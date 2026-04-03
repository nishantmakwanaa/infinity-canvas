import { Pencil, Trash2, X, Check } from 'lucide-react';
import type { CanvasMeta } from '@/hooks/useCanvasSync';
import { useMemo, useState } from 'react';

interface CanvasSidebarProps {
  loggedInUserId: string | null;
  canvases: CanvasMeta[];
  currentCanvasId: string | null;
  onCreateCanvas: () => void;
  onSelectCanvas: (id: string) => void;
  onDeleteCanvases: (ids: string[]) => void;
  widthPercent: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function CanvasSidebar({
  loggedInUserId,
  canvases,
  currentCanvasId,
  onCreateCanvas,
  onSelectCanvas,
  onDeleteCanvases,
  widthPercent,
  onResizeStart,
}: CanvasSidebarProps) {
  if (!loggedInUserId) return null;

  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  const toggleSelected = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelected({});
  };

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-[60] border-r border-border bg-card/95 backdrop-blur-sm"
      style={{ width: `${widthPercent}%` }}
    >
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/60"
        onMouseDown={onResizeStart}
      />
      <div className="h-14 px-3 border-b border-border flex items-center justify-between">
        <span className="text-xs font-mono text-foreground">Your Canvases</span>
        <button
          className="w-7 h-7 border border-border hover:bg-accent flex items-center justify-center"
          title="Create new canvas"
          onClick={onCreateCanvas}
        >
          <Pencil size={13} />
        </button>
      </div>
      <div className="p-2 space-y-1 overflow-auto h-[calc(100%-56px-52px)]">
        {canvases.length === 0 && (
          <div className="text-[11px] font-mono text-muted-foreground px-1 py-2">No canvases yet</div>
        )}
        {canvases.map((canvas) => (
          <div
            key={canvas.id}
            className={`w-full border text-xs font-mono transition-colors ${
              currentCanvasId === canvas.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card border-border hover:bg-accent'
            }`}
          >
            <button
              className="w-full text-left px-2 py-2"
              onClick={() => (deleteMode ? toggleSelected(canvas.id) : onSelectCanvas(canvas.id))}
            >
              <div className="flex items-start gap-2">
                {deleteMode && (
                  <div className={`mt-0.5 w-4 h-4 border flex items-center justify-center ${selected[canvas.id] ? 'bg-foreground text-background border-foreground' : 'border-border'}`}>
                    {selected[canvas.id] ? <Check size={12} /> : null}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate">{canvas.name || 'Untitled Canvas'}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">
                    {new Date(canvas.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="absolute left-0 right-0 bottom-0 h-[52px] border-t border-border bg-card/95 px-2 flex items-center justify-between">
        {!deleteMode ? (
          <button
            className="h-9 px-3 border border-border text-xs font-mono hover:bg-accent transition-colors inline-flex items-center gap-2"
            onClick={() => setDeleteMode(true)}
            title="Delete canvases"
          >
            <Trash2 size={14} /> Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              className="h-9 px-3 border border-border text-xs font-mono hover:bg-accent transition-colors inline-flex items-center gap-2"
              onClick={exitDeleteMode}
              title="Cancel"
            >
              <X size={14} /> Cancel
            </button>
            <button
              className={`h-9 px-3 border text-xs font-mono inline-flex items-center gap-2 ${
                selectedIds.length ? 'bg-foreground text-background border-foreground hover:opacity-90' : 'bg-card text-muted-foreground border-border opacity-60 cursor-not-allowed'
              }`}
              disabled={!selectedIds.length}
              onClick={() => { onDeleteCanvases(selectedIds); exitDeleteMode(); }}
              title="Delete selected"
            >
              <Trash2 size={14} /> Delete ({selectedIds.length})
            </button>
          </div>
        )}

        <span className="text-[10px] font-mono text-muted-foreground">
          {deleteMode ? 'Select canvases to delete' : `${canvases.length} total`}
        </span>
      </div>
    </aside>
  );
}
