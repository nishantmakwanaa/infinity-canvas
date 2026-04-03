import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useCanvasStore, type CanvasBlock, genId } from '@/store/canvasStore';
import { CanvasBlockComponent } from './CanvasBlock';
import { DrawingLayer } from './DrawingLayer';
import { toast } from 'sonner';

const CANVAS_BLOCK_CLIPBOARD_KEY = 'cnvs_block_clipboard_v1';

interface CopiedBlockPayload {
  type: 'cnvs-blocks';
  blocks: CanvasBlock[];
}

interface LegacyCopiedBlockPayload {
  type: 'cnvs-block';
  block: CanvasBlock;
}

interface Props {
  readOnly?: boolean;
  leftOffsetPercent?: number;
  loading?: boolean;
}

const DRAWING_TOOLS = ['pencil', 'eraser', 'text', 'shape', 'line', 'arrow'];

export function InfiniteCanvas({ readOnly, leftOffsetPercent = 0, loading = false }: Props) {
  const blocks = useCanvasStore((s) => s.blocks);
  const pan = useCanvasStore((s) => s.pan);
  const zoom = useCanvasStore((s) => s.zoom);
  const setPan = useCanvasStore((s) => s.setPan);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const selectBlocks = useCanvasStore((s) => s.selectBlocks);
  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const isTouchPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const lastTouch = useRef({ x: 0, y: 0 });
  const isDrawing = DRAWING_TOOLS.includes(activeTool);
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; canvasX: number; canvasY: number; blockId: string | null }>({
    open: false,
    x: 0,
    y: 0,
    canvasX: 0,
    canvasY: 0,
    blockId: null,
  });

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const state = useCanvasStore.getState();
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.002;
        state.setZoom(state.zoom * (1 + delta));
      } else {
        state.setPan({ x: state.pan.x - e.deltaX, y: state.pan.y - e.deltaY });
      }
    },
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (loading) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-context-menu="true"]')) {
      return;
    }
    if (menu.open) setMenu((m) => ({ ...m, open: false }));
    if (isDrawing) return;
    if (e.target === containerRef.current || (e.target as HTMLElement).dataset.canvas) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      selectBlock(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (loading) return;
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    const state = useCanvasStore.getState();
    state.setPan({ x: state.pan.x + dx, y: state.pan.y + dy });
  };

  const handleMouseUp = () => {
    isPanning.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (loading || isDrawing) return;
    if (e.touches.length !== 1) return;

    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, video, iframe, [contenteditable="true"]')) {
      return;
    }

    if (menu.open) setMenu((m) => ({ ...m, open: false }));
    isTouchPanning.current = true;
    lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTouchPanning.current || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastTouch.current.x;
    const dy = t.clientY - lastTouch.current.y;
    lastTouch.current = { x: t.clientX, y: t.clientY };
    const state = useCanvasStore.getState();
    state.setPan({ x: state.pan.x + dx, y: state.pan.y + dy });
  };

  const handleTouchEnd = () => {
    isTouchPanning.current = false;
  };

  const dotOffset = {
    backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
  };

  const onCanvasContextMenu = async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || loading) return;

    const target = e.target as HTMLElement;
    const blockEl = target.closest('[data-block-id]') as HTMLElement | null;
    const blockId = blockEl?.dataset.blockId || null;
    const state = useCanvasStore.getState();
    const bounds = containerRef.current?.getBoundingClientRect();
    const left = bounds?.left || 0;
    const top = bounds?.top || 0;
    const canvasX = (e.clientX - left - state.pan.x) / state.zoom;
    const canvasY = (e.clientY - top - state.pan.y) / state.zoom;

    setMenu({ open: true, x: e.clientX, y: e.clientY, canvasX, canvasY, blockId });
  };

  const getEditableElement = (blockId: string) => {
    const blockRoot = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
    if (!blockRoot) return null;
    const editable = blockRoot.querySelector('textarea, input, [contenteditable="true"]') as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLElement
      | null;
    return editable;
  };

  const selectEditableText = (target: HTMLInputElement | HTMLTextAreaElement | HTMLElement | null) => {
    if (!target) return false;
    target.focus();
    if ('select' in target && typeof target.select === 'function') {
      target.select();
      return true;
    }
    if (target.getAttribute('contenteditable') === 'true') {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    return false;
  };

  const readCopiedCanvasBlocks = (): CopiedBlockPayload | null => {
    try {
      const raw = localStorage.getItem(CANVAS_BLOCK_CLIPBOARD_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CopiedBlockPayload | LegacyCopiedBlockPayload;
      if (parsed?.type === 'cnvs-blocks' && Array.isArray((parsed as CopiedBlockPayload).blocks)) {
        const blocks = (parsed as CopiedBlockPayload).blocks.filter((block) => block?.id);
        if (!blocks.length) return null;
        return { type: 'cnvs-blocks', blocks };
      }
      if (parsed?.type === 'cnvs-block' && (parsed as LegacyCopiedBlockPayload).block?.id) {
        return { type: 'cnvs-blocks', blocks: [(parsed as LegacyCopiedBlockPayload).block] };
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const insertCopiedBlocks = (payload: CopiedBlockPayload) => {
    const sourceBlocks = payload.blocks || [];
    if (!sourceBlocks.length) return;

    const minX = Math.min(...sourceBlocks.map((block) => block.x));
    const minY = Math.min(...sourceBlocks.map((block) => block.y));
    const offsetX = menu.canvasX - minX;
    const offsetY = menu.canvasY - minY;

    const clonedBlocks = sourceBlocks.map((source) => {
      const clonedId = genId();
      const clonedTodos = source.todos?.map((todo) => ({ ...todo, id: genId() }));
      return {
        ...source,
        id: clonedId,
        x: source.x + offsetX,
        y: source.y + offsetY,
        todos: clonedTodos,
      } as CanvasBlock;
    });

    useCanvasStore.setState((state) => ({
      blocks: [...state.blocks, ...clonedBlocks],
      selectedBlockId: clonedBlocks[0]?.id || null,
      selectedBlockIds: clonedBlocks.map((block) => block.id),
      activeTool: 'select',
    }));
  };

  const handlePaste = async () => {
    const current = useCanvasStore.getState();
    const selected = current.blocks.filter((block) => current.selectedBlockIds.includes(block.id));
    if (selected.length) {
      insertCopiedBlocks({ type: 'cnvs-blocks', blocks: selected });
      toast.success('Canvas component pasted');
      return;
    }

    const copiedBlocks = readCopiedCanvasBlocks();
    if (copiedBlocks) {
      insertCopiedBlocks(copiedBlocks);
      toast.success('Canvas component pasted');
      return;
    }

    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error('Clipboard access blocked');
      return;
    }
    if (!text) {
      toast.info('Clipboard is empty');
      return;
    }

    try {
      const parsed = JSON.parse(text) as CopiedBlockPayload | LegacyCopiedBlockPayload;
      if (parsed?.type === 'cnvs-blocks' && Array.isArray((parsed as CopiedBlockPayload).blocks)) {
        const nextPayload: CopiedBlockPayload = {
          type: 'cnvs-blocks',
          blocks: (parsed as CopiedBlockPayload).blocks.filter((block) => block?.id),
        };
        if (nextPayload.blocks.length) {
          localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, JSON.stringify(nextPayload));
          insertCopiedBlocks(nextPayload);
          toast.success('Canvas component pasted');
          return;
        }
      }
      if (parsed?.type === 'cnvs-block' && (parsed as LegacyCopiedBlockPayload).block?.id) {
        const nextPayload: CopiedBlockPayload = { type: 'cnvs-blocks', blocks: [(parsed as LegacyCopiedBlockPayload).block] };
        localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, JSON.stringify(nextPayload));
        insertCopiedBlocks(nextPayload);
        toast.success('Canvas component pasted');
        return;
      }
    } catch {
      // Continue as plain text paste.
    }

    const targetId = menu.blockId || useCanvasStore.getState().selectedBlockId;
    if (targetId) {
      const target = useCanvasStore.getState().blocks.find((block) => block.id === targetId);
      if (target) {
        if (target.type === 'link' || target.type === 'media') {
          updateBlock(target.id, { url: text });
        } else {
          updateBlock(target.id, { content: `${target.content || ''}${target.content ? '\n' : ''}${text}` });
        }
        selectBlock(target.id);
        toast.success('Pasted');
        return;
      }
    }

    addBlock('note', menu.canvasX, menu.canvasY);
    const createdId = useCanvasStore.getState().selectedBlockId;
    if (createdId) {
      updateBlock(createdId, { content: text });
    }
    toast.success('Pasted');
  };

  const handleSelect = () => {
    if (menu.blockId) {
      setActiveTool('select');
      selectBlocks([menu.blockId]);
      toast.success('Canvas component selected');
      return;
    }

    if (selectedBlockIds.length) {
      toast.success('Canvas component selected');
      return;
    }

    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.select();
      toast.success('Selected');
      return;
    }

    toast.info('Nothing selectable here');
  };

  const handleSelectAll = () => {
    const ids = useCanvasStore.getState().blocks.map((block) => block.id);
    if (!ids.length) {
      toast.info('Nothing selectable in canvas');
      return;
    }
    setActiveTool('select');
    selectBlocks(ids);
    toast.success('All canvas components selected');
  };

  const handleResetCanvas = () => {
    clearCanvas();
    toast.success('Canvas cleared');
  };

  const closeMenu = () => setMenu((m) => ({ ...m, open: false }));

  return (
    <div
      ref={containerRef}
      data-canvas="true"
      className={`fixed inset-0 canvas-dots overflow-hidden select-none touch-none ${isDrawing ? 'cursor-crosshair' : 'cursor-default'}`}
      style={{ ...dotOffset, left: `${leftOffsetPercent}%` }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={onCanvasContextMenu}
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border/80 border-t-foreground" />
        </div>
      ) : (
        <>
          <div
            data-canvas="true"
            data-canvas-content="true"
            className="absolute inset-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            {blocks.map((block) => (
              <CanvasBlockComponent key={block.id} block={block} readOnly={readOnly} />
            ))}
          </div>

          <DrawingLayer readOnly={readOnly} leftOffsetPercent={leftOffsetPercent} />
        </>
      )}

      {menu.open && !readOnly && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div
            data-context-menu="true"
            data-no-translate="true"
            className="fixed z-[100] w-40 border border-border bg-card p-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleSelect(); closeMenu(); }}>
              Select
            </button>
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleSelectAll(); closeMenu(); }}>
              Select All
            </button>
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleResetCanvas(); closeMenu(); }}>
              Reset Canvas
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent"
              onClick={async () => {
                await handlePaste();
                closeMenu();
              }}
            >
              Paste
            </button>
          </div>
        </>
      )}
    </div>
  );
}
