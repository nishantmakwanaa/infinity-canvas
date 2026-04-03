import { Pencil, Trash2, X, Check } from 'lucide-react';
import type { CanvasMeta } from '@/hooks/useCanvasSync';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CanvasSidebarProps {
  loggedInUserId: string | null;
  canvases: CanvasMeta[];
  currentCanvasId: string | null;
  onCreateCanvas: () => void;
  onSelectCanvas: (id: string) => void;
  onDeleteCanvases: (ids: string[]) => void;
  widthPercent: number;
  setWidthPercent: (value: number | ((prev: number) => number)) => void;
  isMobile?: boolean;
}

export function CanvasSidebar({
  loggedInUserId,
  canvases,
  currentCanvasId,
  onCreateCanvas,
  onSelectCanvas,
  onDeleteCanvases,
  widthPercent,
  setWidthPercent,
  isMobile = false,
}: CanvasSidebarProps) {
  if (!loggedInUserId) return null;

  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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

  const startResize = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const next = (ev.clientX / window.innerWidth) * 100;
      setWidthPercent(Math.max(10, Math.min(30, next)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-[60] border-r border-border bg-card/95 backdrop-blur-sm"
      style={{ width: isMobile ? '70%' : `${widthPercent}%` }}
    >
      {!isMobile && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/70"
          onMouseDown={startResize}
          title="Resize sidebar"
        />
      )}
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
              onClick={() => setConfirmDeleteOpen(true)}
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

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm" data-no-translate="true">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">Delete selected canvases?</DialogTitle>
            <DialogDescription className="text-xs font-mono">
              This action cannot be undone. {selectedIds.length} canvas{selectedIds.length > 1 ? 'es' : ''} will be removed.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-44 overflow-auto border border-border">
            {canvases
              .filter((canvas) => selected[canvas.id])
              .map((canvas) => (
                <div key={canvas.id} className="px-2 py-1.5 text-xs font-mono border-b border-border last:border-b-0">
                  {canvas.name || 'Untitled Canvas'}
                </div>
              ))}
          </div>

          <DialogFooter>
            <button
              className="h-8 px-3 border border-border text-xs font-mono"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-8 px-3 border border-foreground bg-foreground text-background text-xs font-mono"
              onClick={() => {
                onDeleteCanvases(selectedIds);
                setConfirmDeleteOpen(false);
                exitDeleteMode();
              }}
            >
              Confirm delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
