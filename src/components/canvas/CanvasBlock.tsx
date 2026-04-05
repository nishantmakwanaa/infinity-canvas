import React, { useRef, useState } from 'react';
import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { NoteBlock } from './blocks/NoteBlock';
import { LinkBlock } from './blocks/LinkBlock';
import { TodoBlock } from './blocks/TodoBlock';
import { MediaBlock } from './blocks/MediaBlock';
import { X } from 'lucide-react';
import { getBlockForegroundColor, getBlockMutedColor } from '@/lib/blockColors';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  block: CanvasBlock;
  readOnly?: boolean;
}

type ResizeDir = 'n' | 's' | 'e' | 'w';

function CanvasBlockComponentImpl({ block, readOnly }: Props) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const deleteBlock = useCanvasStore((s) => s.deleteBlock);
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const selectedBlockId = useCanvasStore((s) => s.selectedBlockId);
  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const zoom = useCanvasStore((s) => s.zoom);
  const isMobile = useIsMobile();
  const isSelected = selectedBlockId === block.id || selectedBlockIds.includes(block.id);
  const [isHovered, setIsHovered] = useState(false);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const handleBlockWheelCapture = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const state = useCanvasStore.getState();
    const delta = -e.deltaY * 0.002;
    state.setZoom(state.zoom * (1 + delta));
  };

  const isInteractiveTarget = (t: HTMLElement) => {
    return Boolean(
      t.dataset.resize
      || t.tagName === 'INPUT'
      || t.tagName === 'TEXTAREA'
      || t.tagName === 'VIDEO'
      || t.tagName === 'AUDIO'
      || t.tagName === 'IFRAME'
      || t.isContentEditable
      || t.closest('button')
      || t.closest('a')
      || t.closest('[data-media-interactive="true"]')
    );
  };

  const startPointerDrag = (
    e: React.PointerEvent<HTMLElement>,
    options?: { requireSelectedTouch?: boolean }
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // On touch devices, first tap selects; dragging starts on subsequent gesture.
    const requireSelectedTouch = options?.requireSelectedTouch ?? true;
    if (e.pointerType === 'touch' && requireSelectedTouch && !isSelected) return;
    if (e.pointerType === 'touch') {
      e.preventDefault();
    }

    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y };
    let rafId: number | null = null;
    let pendingClientX = e.clientX;
    let pendingClientY = e.clientY;

    const flushDrag = () => {
      rafId = null;
      if (!dragRef.current.dragging) return;
      updateBlock(block.id, {
        x: dragRef.current.origX + (pendingClientX - dragRef.current.startX) / zoom,
        y: dragRef.current.origY + (pendingClientY - dragRef.current.startY) / zoom,
      });
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      pendingClientX = ev.clientX;
      pendingClientY = ev.clientY;
      if (ev.pointerType === 'touch') {
        ev.preventDefault();
      }
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(flushDrag);
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleBlockPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const t = e.target as HTMLElement;
    if (isInteractiveTarget(t)) return;

    e.stopPropagation();
    selectBlock(block.id);

    // Desktop keeps drag-from-block behavior; mobile drag starts only from header.
    if (!isMobile) {
      startPointerDrag(e);
    }
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;

    e.stopPropagation();
    selectBlock(block.id);
    startPointerDrag(e, { requireSelectedTouch: false });
  };

  const handleResize = (e: React.MouseEvent, dir: ResizeDir) => {
    if (readOnly || isMobile) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const oX = block.x, oY = block.y, oW = block.width, oH = block.height;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let x = oX, y = oY, w = oW, h = oH;
      if (dir.includes('e')) w = Math.max(120, oW + dx);
      if (dir.includes('w')) { w = Math.max(120, oW - dx); x = oX + oW - w; }
      if (dir.includes('s')) h = Math.max(60, oH + dy);
      if (dir.includes('n')) { h = Math.max(60, oH - dy); y = oY + oH - h; }
      updateBlock(block.id, { x, y, width: w, height: h });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderContent = () => {
    switch (block.type) {
      case 'note': return <NoteBlock block={block} readOnly={readOnly} />;
      case 'link': return <LinkBlock block={block} readOnly={readOnly} />;
      case 'todo': return <TodoBlock block={block} readOnly={readOnly} />;
      case 'media': return <MediaBlock block={block} readOnly={readOnly} />;
      default: return <NoteBlock block={block} readOnly={readOnly} />;
    }
  };

  const typeLabel = block.type === 'media' ? 'media' : block.type;
  const foregroundColor = getBlockForegroundColor(block.backgroundColor);
  const mutedColor = getBlockMutedColor(block.backgroundColor);

  return (
    <div
      data-block-id={block.id}
      className={`absolute block-base select-none ${isSelected && !readOnly ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        backgroundColor: block.backgroundColor || undefined,
      }}
      onPointerDown={handleBlockPointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onWheelCapture={handleBlockWheelCapture}
    >
      <div
        className={`flex items-center justify-between px-2 h-7 border-b border-border bg-secondary/50 ${readOnly ? '' : 'cursor-move touch-none'}`}
        onPointerDown={handleHeaderPointerDown}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest truncate" style={{ color: mutedColor || undefined }}>{typeLabel}</span>
        {!readOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }}
            className="transition-colors"
            style={{ color: mutedColor || foregroundColor || undefined }}
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div
        className="overflow-auto no-scrollbar"
        style={{
          height: block.height - 28,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y pan-x',
        }}
      >
        {renderContent()}
      </div>

      {/* Resize handles - full side edges (no corner directions) */}
      {!readOnly && !isMobile && (isSelected || isHovered) && (
        <>
          <div data-resize="true" className="absolute top-0 left-2 right-2 h-3 cursor-n-resize hover:bg-foreground/10" onMouseDown={(e) => handleResize(e, 'n')} />
          <div data-resize="true" className="absolute bottom-0 left-2 right-2 h-3 cursor-s-resize hover:bg-foreground/10" onMouseDown={(e) => handleResize(e, 's')} />
          <div data-resize="true" className="absolute left-0 top-2 bottom-2 w-3 cursor-w-resize hover:bg-foreground/10" onMouseDown={(e) => handleResize(e, 'w')} />
          <div data-resize="true" className="absolute right-0 top-2 bottom-2 w-3 cursor-e-resize hover:bg-foreground/10" onMouseDown={(e) => handleResize(e, 'e')} />
        </>
      )}
    </div>
  );
}

export const CanvasBlockComponent = React.memo(CanvasBlockComponentImpl);
