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
  const isTouchPinching = useRef(false);
  const pinchRef = useRef({
    worldX: 0,
    worldY: 0,
    startZoom: 1,
    startDistance: 0,
  });
  const lastMouse = useRef({ x: 0, y: 0 });
  const lastTouch = useRef({ x: 0, y: 0 });
  const isHandTool = activeTool === 'hand';
  const isDrawing = DRAWING_TOOLS.includes(activeTool);
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; canvasX: number; canvasY: number; blockId: string | null }>({
    open: false,
    x: 0,
    y: 0,
    canvasX: 0,
    canvasY: 0,
    blockId: null,
  });

  const isScrollableElement = (el: Element) => {
    const node = el as HTMLElement;
    const style = window.getComputedStyle(node);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    return canScrollY || canScrollX;
  };

  const hasScrollableAncestor = (startTarget: EventTarget | null) => {
    const root = containerRef.current;
    let node = startTarget instanceof Element ? startTarget : null;
    while (node && root && node !== root) {
      if (isScrollableElement(node)) return true;
      node = node.parentElement;
    }
    return false;
  };

  const canNativeScrollFromTarget = (startTarget: EventTarget | null, deltaX: number, deltaY: number) => {
    const root = containerRef.current;
    let node = startTarget instanceof Element ? (startTarget as HTMLElement) : null;
    while (node && root && node !== root) {
      const style = window.getComputedStyle(node);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
      const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;

      if (canScrollY) {
        const canDown = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
        const canUp = node.scrollTop > 0;
        if ((deltaY > 0 && canDown) || (deltaY < 0 && canUp)) return true;
      }

      if (canScrollX) {
        const canRight = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
        const canLeft = node.scrollLeft > 0;
        if ((deltaX > 0 && canRight) || (deltaX < 0 && canLeft)) return true;
      }

      node = node.parentElement;
    }
    return false;
  };

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (canNativeScrollFromTarget(e.target, e.deltaX, e.deltaY)) {
        return;
      }
      e.preventDefault();
      const state = useCanvasStore.getState();
      const canPinchZoom = e.ctrlKey || e.metaKey;
      if (canPinchZoom) {
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
    // Keep current selection for context-menu workflows.
    if (e.button !== 0) {
      return;
    }
    if (menu.open) setMenu((m) => ({ ...m, open: false }));
    if (isDrawing) return;

    if (isHandTool) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      selectBlock(null);
      return;
    }

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
    const bounds = containerRef.current?.getBoundingClientRect();
    const left = bounds?.left || 0;
    const top = bounds?.top || 0;

    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const distance = Math.hypot(dx, dy);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const state = useCanvasStore.getState();

      isTouchPanning.current = false;
      isTouchPinching.current = true;
      pinchRef.current = {
        startDistance: Math.max(1, distance),
        startZoom: state.zoom,
        worldX: (midX - left - state.pan.x) / state.zoom,
        worldY: (midY - top - state.pan.y) / state.zoom,
      };
      e.preventDefault();
      return;
    }

    if (e.touches.length !== 1) return;

    if (isHandTool) {
      isTouchPinching.current = false;
      isTouchPanning.current = true;
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      selectBlock(null);
      return;
    }

    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, video, iframe, [contenteditable="true"]')) {
      return;
    }
    if (hasScrollableAncestor(target)) {
      return;
    }

    if (menu.open) setMenu((m) => ({ ...m, open: false }));
    isTouchPinching.current = false;
    isTouchPanning.current = true;
    lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isTouchPinching.current) {
      e.preventDefault();
      const bounds = containerRef.current?.getBoundingClientRect();
      const left = bounds?.left || 0;
      const top = bounds?.top || 0;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const nextZoom = pinchRef.current.startZoom * (distance / pinchRef.current.startDistance);
      const clampedZoom = Math.min(8, Math.max(0.05, nextZoom));
      const nextPan = {
        x: midX - left - pinchRef.current.worldX * clampedZoom,
        y: midY - top - pinchRef.current.worldY * clampedZoom,
      };

      const state = useCanvasStore.getState();
      state.setZoom(clampedZoom);
      state.setPan(nextPan);
      return;
    }

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
    isTouchPinching.current = false;
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

  const getViewportCenterCanvasPoint = () => {
    const bounds = containerRef.current?.getBoundingClientRect();
    const left = bounds?.left || 0;
    const top = bounds?.top || 0;
    const width = bounds?.width || window.innerWidth;
    const height = bounds?.height || window.innerHeight;
    const state = useCanvasStore.getState();
    return {
      x: (left + width / 2 - left - state.pan.x) / state.zoom,
      y: (top + height / 2 - top - state.pan.y) / state.zoom,
    };
  };

  const getPasteTargetPoint = () => {
    if (menu.open) {
      return { x: menu.canvasX, y: menu.canvasY };
    }
    return getViewportCenterCanvasPoint();
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

  const insertCopiedBlocks = (payload: CopiedBlockPayload, targetPoint: { x: number; y: number }) => {
    const sourceBlocks = payload.blocks || [];
    if (!sourceBlocks.length) return;

    const minX = Math.min(...sourceBlocks.map((block) => block.x));
    const minY = Math.min(...sourceBlocks.map((block) => block.y));
    const offsetX = targetPoint.x - minX;
    const offsetY = targetPoint.y - minY;

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
    const targetPoint = getPasteTargetPoint();
    const current = useCanvasStore.getState();
    const selected = current.blocks.filter((block) => current.selectedBlockIds.includes(block.id));
    if (selected.length) {
      insertCopiedBlocks({ type: 'cnvs-blocks', blocks: selected }, targetPoint);
      toast.success('Canvas component pasted');
      return;
    }

    const copiedBlocks = readCopiedCanvasBlocks();
    if (copiedBlocks) {
      insertCopiedBlocks(copiedBlocks, targetPoint);
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
          insertCopiedBlocks(nextPayload, targetPoint);
          toast.success('Canvas component pasted');
          return;
        }
      }
      if (parsed?.type === 'cnvs-block' && (parsed as LegacyCopiedBlockPayload).block?.id) {
        const nextPayload: CopiedBlockPayload = { type: 'cnvs-blocks', blocks: [(parsed as LegacyCopiedBlockPayload).block] };
        localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, JSON.stringify(nextPayload));
        insertCopiedBlocks(nextPayload, targetPoint);
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

    addBlock('note', targetPoint.x, targetPoint.y);
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
      className={`fixed inset-0 canvas-dots overflow-hidden select-none ${isDrawing ? 'cursor-crosshair' : isHandTool ? 'cursor-grab' : 'cursor-default'}`}
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
            className={`absolute inset-0 origin-top-left ${isHandTool ? 'pointer-events-none' : ''}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            {blocks.map((block) => (
              <CanvasBlockComponent key={block.id} block={block} readOnly={readOnly} />
            ))}
          </div>

          <DrawingLayer readOnly={readOnly} />
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
            <button
              className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent"
              onClick={async () => {
                await handlePaste();
                closeMenu();
              }}
            >
              Paste
            </button>
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleSelect(); closeMenu(); }}>
              Select
            </button>
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleSelectAll(); closeMenu(); }}>
              Select All
            </button>
            <div className="my-1 h-px bg-border" />
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleResetCanvas(); closeMenu(); }}>
              Reset Canvas
            </button>
          </div>
        </>
      )}
    </div>
  );
}
