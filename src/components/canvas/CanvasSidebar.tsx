import { Pencil, Trash2, X, Check } from 'lucide-react';
import type { CanvasMeta } from '@/hooks/useCanvasSync';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPageNumber, parseCanvasRouteName } from '@/lib/canvasNaming';

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
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const groupedCanvases = useMemo(() => {
    const bySlug = new Map<string, {
      canvasSlug: string;
      canvasLabel: string;
      pages: Array<{ id: string; pageSlug: string; pageLabel: string; updatedAt: string }>;
      latestUpdatedAt: string;
    }>();

    canvases.forEach((canvas) => {
      const parsed = parseCanvasRouteName(canvas.name);
      const existing = bySlug.get(parsed.canvasSlug);
      const page = { id: canvas.id, pageSlug: parsed.pageSlug, pageLabel: parsed.pageLabel, updatedAt: canvas.updated_at };

      if (!existing) {
        bySlug.set(parsed.canvasSlug, {
          canvasSlug: parsed.canvasSlug,
          canvasLabel: parsed.canvasLabel,
          pages: [page],
          latestUpdatedAt: canvas.updated_at,
        });
        return;
      }

      existing.pages.push(page);
      if (canvas.updated_at > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = canvas.updated_at;
      }
    });

    return Array.from(bySlug.values())
      .map((group) => ({
        ...group,
        pages: group.pages.sort((a, b) => {
          const aNum = getPageNumber(a.pageSlug) ?? Number.MAX_SAFE_INTEGER;
          const bNum = getPageNumber(b.pageSlug) ?? Number.MAX_SAFE_INTEGER;
          return aNum - bNum;
        }),
      }))
      .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
  }, [canvases]);

  const currentCanvasGroupSlug = useMemo(() => {
    if (!currentCanvasId) return null;
    const currentCanvas = canvases.find((canvas) => canvas.id === currentCanvasId);
    if (!currentCanvas) return null;
    return parseCanvasRouteName(currentCanvas.name).canvasSlug;
  }, [canvases, currentCanvasId]);

  const selectedGroupSlugs = useMemo(
    () => Object.entries(selectedGroups).filter(([, v]) => v).map(([k]) => k),
    [selectedGroups]
  );

  const selectedIds = useMemo(() => {
    if (!selectedGroupSlugs.length) return [] as string[];
    const selectedSet = new Set(selectedGroupSlugs);
    return groupedCanvases
      .filter((group) => selectedSet.has(group.canvasSlug))
      .flatMap((group) => group.pages.map((page) => page.id));
  }, [groupedCanvases, selectedGroupSlugs]);

  const toggleSelectedGroup = (canvasSlug: string) => {
    setSelectedGroups((prev) => ({ ...prev, [canvasSlug]: !prev[canvasSlug] }));
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedGroups({});
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

  if (!loggedInUserId) return null;

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
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-foreground flex items-center justify-center">
            <span className="text-background text-[10px] font-bold font-mono">C</span>
          </div>
          <span className="text-xs font-mono font-semibold tracking-tight text-foreground">CNVS</span>
        </div>
        <button
          className="w-7 h-7 border border-border hover:bg-accent flex items-center justify-center"
          title="Create new canvas"
          onClick={onCreateCanvas}
        >
          <Pencil size={13} />
        </button>
      </div>
      <div className="p-2 space-y-1 overflow-auto h-[calc(100%-56px-52px)]">
        {groupedCanvases.length === 0 && (
          <div className="text-[11px] font-mono text-muted-foreground px-1 py-2">No canvases yet</div>
        )}
        {groupedCanvases.map((group) => {
          const isCurrentGroup = group.canvasSlug === currentCanvasGroupSlug;
          const isSelectedGroup = Boolean(selectedGroups[group.canvasSlug]);
          const defaultPageId = group.pages[0]?.id;

          return (
            <div key={group.canvasSlug} className="border border-border bg-card">
              <button
                className={`w-full text-left px-2 py-2 text-xs font-mono transition-colors ${
                  isCurrentGroup && !deleteMode ? 'bg-foreground text-background border-foreground' : 'hover:bg-accent'
                }`}
                onClick={() => {
                  if (deleteMode) {
                    toggleSelectedGroup(group.canvasSlug);
                    return;
                  }
                  if (defaultPageId) onSelectCanvas(defaultPageId);
                }}
              >
                <div className="flex items-center gap-2">
                  {deleteMode && (
                    <div className={`w-4 h-4 border flex items-center justify-center ${isSelectedGroup ? 'bg-foreground text-background border-foreground' : 'border-border'}`}>
                      {isSelectedGroup ? <Check size={12} /> : null}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 truncate">{group.canvasLabel}</div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="absolute left-0 right-0 bottom-0 h-[52px] border-t border-border bg-card/95 px-2 flex items-center gap-2">
        {!deleteMode ? (
          <button
            className="h-9 px-3 border border-border text-xs font-mono hover:bg-accent transition-colors inline-flex items-center gap-2"
            onClick={() => setDeleteMode(true)}
            title="Delete canvases"
          >
            <Trash2 size={14} /> Delete
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
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

        <span className="ml-auto min-w-0 max-w-[42%] truncate text-right text-[10px] font-mono text-muted-foreground">
          {deleteMode ? 'Select canvases to delete' : `${groupedCanvases.length} total`}
        </span>
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm" data-no-translate="true">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">Delete selected canvases?</DialogTitle>
            <DialogDescription className="text-xs font-mono">
              This action cannot be undone. {selectedGroupSlugs.length} main canvas{selectedGroupSlugs.length > 1 ? 'es' : ''} ({selectedIds.length} pages) will be removed.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-44 overflow-auto border border-border">
            {groupedCanvases
              .filter((group) => selectedGroups[group.canvasSlug])
              .map((group) => (
                <div key={group.canvasSlug} className="px-2 py-1.5 text-xs font-mono border-b border-border last:border-b-0">
                  {group.canvasLabel} ({group.pages.length} pages)
                </div>
              ))}
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
            <button
              className="h-8 w-full px-3 border border-border text-xs font-mono"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-8 w-full px-3 border border-foreground bg-foreground text-background text-xs font-mono"
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
