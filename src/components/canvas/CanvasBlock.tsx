import React, { useRef, useState } from 'react';
import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { NoteBlock } from './blocks/NoteBlock';
import { LinkBlock } from './blocks/LinkBlock';
import { TodoBlock } from './blocks/TodoBlock';
import { MediaBlock } from './blocks/MediaBlock';
import { X } from 'lucide-react';

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
  const isSelected = selectedBlockId === block.id || selectedBlockIds.includes(block.id);
  const [isHovered, setIsHovered] = useState(false);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const handleDragStart = (e: React.MouseEvent) => {
    if (readOnly) return;
    const t = e.target as HTMLElement;
    if (t.dataset.resize || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'VIDEO' || t.closest('button')) return;
    e.stopPropagation();
    selectBlock(block.id);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      updateBlock(block.id, {
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX) / zoom,
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY) / zoom,
      });
    };
    const onUp = () => { dragRef.current.dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleResize = (e: React.MouseEvent, dir: ResizeDir) => {
    if (readOnly) return;
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
      onMouseDown={handleDragStart}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex items-center justify-between px-2 h-7 border-b border-border bg-secondary/50 ${readOnly ? '' : 'cursor-move'}`}>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{typeLabel}</span>
        {!readOnly && (
          <button onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="overflow-auto no-scrollbar" style={{ height: block.height - 28 }}>
        {renderContent()}
      </div>

      {/* Resize handles - full side edges (no corner directions) */}
      {!readOnly && (isSelected || isHovered) && (
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
