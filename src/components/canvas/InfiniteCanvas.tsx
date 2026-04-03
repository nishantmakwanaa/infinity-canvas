import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useCanvasStore, type CanvasBlock, genId } from '@/store/canvasStore';
import { CanvasBlockComponent } from './CanvasBlock';
import { DrawingLayer } from './DrawingLayer';
import { toast } from 'sonner';

const CANVAS_BLOCK_CLIPBOARD_KEY = 'cnvs_block_clipboard_v1';

interface CopiedBlockPayload {
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
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
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

  const readCopiedCanvasBlock = (): CopiedBlockPayload | null => {
    try {
      const raw = localStorage.getItem(CANVAS_BLOCK_CLIPBOARD_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CopiedBlockPayload;
      if (parsed?.type !== 'cnvs-block' || !parsed?.block?.id) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const insertCopiedBlock = (payload: CopiedBlockPayload) => {
    const source = payload.block;
    const clonedId = genId();
    const clonedTodos = source.todos?.map((todo) => ({ ...todo, id: genId() }));
    const cloned: CanvasBlock = {
      ...source,
      id: clonedId,
      x: menu.canvasX,
      y: menu.canvasY,
      todos: clonedTodos,
    };

    useCanvasStore.setState((state) => ({
      blocks: [...state.blocks, cloned],
      selectedBlockId: clonedId,
      activeTool: 'select',
    }));
  };

  const handlePaste = async () => {
    const copiedBlock = readCopiedCanvasBlock();
    if (copiedBlock) {
      insertCopiedBlock(copiedBlock);
      toast.success('Canvas block pasted');
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
      const parsed = JSON.parse(text) as CopiedBlockPayload;
      if (parsed?.type === 'cnvs-block' && parsed?.block?.id) {
        localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, text);
        insertCopiedBlock(parsed);
        toast.success('Canvas block pasted');
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
      selectBlock(menu.blockId);
      selectEditableText(getEditableElement(menu.blockId));
      return;
    }

    const selectedId = useCanvasStore.getState().selectedBlockId;
    if (selectedId) {
      selectEditableText(getEditableElement(selectedId));
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
    if (menu.blockId) {
      if (selectEditableText(getEditableElement(menu.blockId))) return;
    }

    const selectedId = useCanvasStore.getState().selectedBlockId;
    if (selectedId) {
      if (selectEditableText(getEditableElement(selectedId))) return;
    }

    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.select();
      toast.success('Selected all');
      return;
    }

    const canvasEl = containerRef.current?.querySelector('[data-canvas-content="true"]') as HTMLElement | null;
    if (!canvasEl) {
      toast.info('Nothing selectable in canvas');
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(canvasEl);
    selection?.removeAllRanges();
    selection?.addRange(range);
    toast.success('Selected all in canvas');
  };

  const handleResetCanvas = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    selectBlock(null);
    toast.success('Canvas reset');
  };

  const closeMenu = () => setMenu((m) => ({ ...m, open: false }));

  return (
    <div
      ref={containerRef}
      data-canvas="true"
      className={`fixed inset-0 canvas-dots overflow-hidden select-none ${isDrawing ? 'cursor-crosshair' : 'cursor-default'}`}
      style={{ ...dotOffset, left: `${leftOffsetPercent}%` }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={onCanvasContextMenu}
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
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
