import React, { useRef } from 'react';
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

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function CanvasBlockComponent({ block, readOnly }: Props) {
  const { updateBlock, deleteBlock, selectBlock, selectedBlockId, zoom } = useCanvasStore();
  const isSelected = selectedBlockId === block.id;
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
      className={`absolute block-base select-none ${isSelected && !readOnly ? 'ring-1 ring-foreground' : ''}`}
      style={{ left: block.x, top: block.y, width: block.width, height: block.height }}
      onMouseDown={handleDragStart}
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

      {/* Resize handles - all 8 directions */}
      {!readOnly && isSelected && (
        <>
          {/* Edges */}
          <div data-resize="true" className="absolute top-0 left-2 right-2 h-1 cursor-n-resize" onMouseDown={(e) => handleResize(e, 'n')} />
          <div data-resize="true" className="absolute bottom-0 left-2 right-2 h-1 cursor-s-resize" onMouseDown={(e) => handleResize(e, 's')} />
          <div data-resize="true" className="absolute left-0 top-2 bottom-2 w-1 cursor-w-resize" onMouseDown={(e) => handleResize(e, 'w')} />
          <div data-resize="true" className="absolute right-0 top-2 bottom-2 w-1 cursor-e-resize" onMouseDown={(e) => handleResize(e, 'e')} />
          {/* Corners */}
          <div data-resize="true" className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" onMouseDown={(e) => handleResize(e, 'nw')} />
          <div data-resize="true" className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" onMouseDown={(e) => handleResize(e, 'ne')} />
          <div data-resize="true" className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" onMouseDown={(e) => handleResize(e, 'sw')} />
          <div data-resize="true" className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize border-r-2 border-b-2 border-muted-foreground/40" onMouseDown={(e) => handleResize(e, 'se')} />
        </>
      )}
      {/* Always show SE handle */}
      {!readOnly && !isSelected && (
        <div data-resize="true" className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize border-r-2 border-b-2 border-muted-foreground/40 hover:border-foreground transition-colors" onMouseDown={(e) => handleResize(e, 'se')} />
      )}
    </div>
  );
}
