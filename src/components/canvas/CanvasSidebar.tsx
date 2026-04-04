import { Pencil, Trash2, X, Check, User as UserIcon, LogOut } from 'lucide-react';
import type { CanvasMeta } from '@/hooks/useCanvasSync';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPageNumber, parseCanvasRouteName } from '@/lib/canvasNaming';

interface SidebarUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface CanvasSidebarProps {
  loggedInUserId: string | null;
  canvases: CanvasMeta[];
  currentCanvasId: string | null;
  onCreateCanvas: () => void;
  onSelectCanvas: (id: string) => void;
  onDeleteCanvases: (ids: string[]) => void;
  user?: SidebarUser | null;
  onSignOut?: () => void;
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
  user,
  onSignOut,
  widthPercent,
  setWidthPercent,
  isMobile = false,
}: CanvasSidebarProps) {
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Record<string, boolean>>({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profilePanelRef = useRef<HTMLDivElement>(null);

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

  const selectedIds = useMemo(() => {
    return Object.entries(selectedPages)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
  }, [selectedPages]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const statusLabel = deleteMode
    ? `Select pages to delete${selectedIds.length ? ` (${selectedIds.length} selected)` : ''}`
    : `${groupedCanvases.length} total`;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.id, user?.avatarUrl]);

  useEffect(() => {
    if (!showProfileMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (profileButtonRef.current?.contains(target)) return;
      if (profilePanelRef.current?.contains(target)) return;
      setShowProfileMenu(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [showProfileMenu]);

  const toggleSelectedPage = (pageId: string) => {
    setSelectedPages((prev) => ({ ...prev, [pageId]: !prev[pageId] }));
  };

  const toggleSelectedGroupPages = (pageIds: string[]) => {
    setSelectedPages((prev) => {
      const allSelected = pageIds.every((id) => Boolean(prev[id]));
      const next = { ...prev };
      pageIds.forEach((id) => {
        next[id] = !allSelected;
      });
      return next;
    });
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedPages({});
  };

  const startResize = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const next = (ev.clientX / window.innerWidth) * 100;
      setWidthPercent(Math.max(8, Math.min(20, next)));
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
      <div className="p-2 space-y-1 overflow-auto no-scrollbar h-[calc(100%-56px-58px)]">
        {groupedCanvases.length === 0 && (
          <div className="text-[11px] font-mono text-muted-foreground px-1 py-2">No canvases yet</div>
        )}
        {groupedCanvases.map((group) => {
          const isCurrentGroup = group.canvasSlug === currentCanvasGroupSlug;
          const groupPageIds = group.pages.map((page) => page.id);
          const selectedPagesInGroup = group.pages.filter((page) => Boolean(selectedPages[page.id]));
          const areAllPagesSelected = group.pages.length > 0 && selectedPagesInGroup.length === group.pages.length;
          const defaultPageId = group.pages[0]?.id;

          return (
            <div key={group.canvasSlug} className="border border-border bg-card">
              <button
                className={`w-full text-left px-2 py-2 text-xs font-mono transition-colors ${
                  isCurrentGroup && !deleteMode ? 'bg-foreground text-background border-foreground' : 'hover:bg-accent'
                }`}
                onClick={() => {
                  if (deleteMode) {
                    toggleSelectedGroupPages(groupPageIds);
                    return;
                  }
                  if (defaultPageId) onSelectCanvas(defaultPageId);
                }}
              >
                <div className="flex items-center gap-2">
                  {deleteMode && (
                    <div className={`w-4 h-4 border flex items-center justify-center ${areAllPagesSelected ? 'bg-foreground text-background border-foreground' : 'border-border'}`}>
                      {areAllPagesSelected ? <Check size={12} /> : null}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 truncate">{group.canvasLabel}</div>
                  <div className="text-[10px] text-muted-foreground">{group.pages.length}</div>
                </div>
              </button>

              {deleteMode && (
                <div className="border-t border-border bg-card/60">
                  {group.pages.map((page) => {
                    const isSelectedPage = Boolean(selectedPages[page.id]);
                    const isCurrentPage = page.id === currentCanvasId;
                    return (
                      <button
                        key={page.id}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors inline-flex items-center gap-2 ${isCurrentPage ? 'text-foreground' : 'text-muted-foreground'} hover:bg-accent`}
                        onClick={() => toggleSelectedPage(page.id)}
                      >
                        <div className={`w-3.5 h-3.5 border flex items-center justify-center ${isSelectedPage ? 'bg-foreground text-background border-foreground' : 'border-border'}`}>
                          {isSelectedPage ? <Check size={10} /> : null}
                        </div>
                        <span className="truncate">{page.pageLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="absolute left-0 right-0 bottom-0 h-[58px] border-t border-border bg-card/95 px-2 py-2 flex items-center gap-2">
        {user && (
          <div className="relative" ref={profilePanelRef}>
            <button
              ref={profileButtonRef}
              className="h-9 w-9 border border-border hover:bg-accent transition-colors inline-flex items-center justify-center"
              onClick={() => setShowProfileMenu((prev) => !prev)}
              title={user.displayName}
            >
              {user.avatarUrl && !avatarLoadFailed ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-5 h-5 object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <UserIcon size={14} />
              )}
            </button>

            {showProfileMenu && (
              <div className="absolute left-0 bottom-10 z-50 w-56 border border-border bg-card p-3 space-y-3 shadow-lg">
                <div className="flex items-center gap-2">
                  {user.avatarUrl && !avatarLoadFailed ? (
                    <img src={user.avatarUrl} alt="" className="w-8 h-8 object-cover" referrerPolicy="no-referrer" onError={() => setAvatarLoadFailed(true)} />
                  ) : (
                    <div className="w-8 h-8 bg-muted flex items-center justify-center"><UserIcon size={14} /></div>
                  )}
                  <span className="text-xs font-mono text-foreground truncate">{user.displayName}</span>
                </div>
                <button
                  className="flex items-center gap-2 w-full text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onSignOut?.();
                  }}
                >
                  <LogOut size={12} /> Sign out
                </button>
              </div>
            )}
          </div>
        )}

        {!deleteMode ? (
          <button
            className="h-9 w-9 border border-border hover:bg-accent transition-colors inline-flex items-center justify-center"
            onClick={() => setDeleteMode(true)}
            title="Delete canvases"
          >
            <Trash2 size={14} />
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <button
              className={`h-9 px-2 border text-xs font-mono inline-flex items-center gap-1 ${
                selectedIds.length ? 'bg-foreground text-background border-foreground hover:opacity-90' : 'bg-card text-muted-foreground border-border opacity-60 cursor-not-allowed'
              }`}
              disabled={!selectedIds.length}
              onClick={() => setConfirmDeleteOpen(true)}
              title="Delete selected"
            >
              <Trash2 size={14} /> ({selectedIds.length})
            </button>
            <button
              className="h-9 w-9 border border-border inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={exitDeleteMode}
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <span className="ml-auto min-w-0 max-w-[44%] truncate text-right text-[10px] font-mono text-muted-foreground">
          {statusLabel}
        </span>
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm" data-no-translate="true">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">Delete selected pages?</DialogTitle>
            <DialogDescription className="text-xs font-mono">
              This action cannot be undone. {selectedIds.length} page{selectedIds.length > 1 ? 's' : ''} will be removed.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-44 overflow-auto no-scrollbar border border-border">
            {groupedCanvases.map((group) =>
              group.pages
                .filter((page) => selectedIdSet.has(page.id))
                .map((page) => (
                  <div key={page.id} className="px-2 py-1.5 text-xs font-mono border-b border-border last:border-b-0">
                    {group.canvasLabel} / {page.pageLabel}
                  </div>
                ))
            )}
          </div>

          <DialogFooter className="flex items-center justify-start gap-2 sm:justify-start">
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
            <button
              className="h-8 w-8 border border-border inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => setConfirmDeleteOpen(false)}
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
