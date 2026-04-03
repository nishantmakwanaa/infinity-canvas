import React, { useRef, useState } from 'react';
import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { NoteBlock } from './blocks/NoteBlock';
import { LinkBlock } from './blocks/LinkBlock';
import { TodoBlock } from './blocks/TodoBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { X } from 'lucide-react';

interface Props {
  block: CanvasBlock;
  readOnly?: boolean;
}

export function CanvasBlockComponent({ block, readOnly }: Props) {
  const { updateBlock, deleteBlock, selectBlock, selectedBlockId, zoom } = useCanvasStore();
  const isSelected = selectedBlockId === block.id;
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const resizeRef = useRef({ resizing: false, startX: 0, startY: 0, origW: 0, origH: 0 });
  const [isResizing, setIsResizing] = useState(false);

  const handleDragStart = (e: React.MouseEvent) => {
    if (readOnly) return;
    if ((e.target as HTMLElement).dataset.resize || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    e.stopPropagation();
    selectBlock(block.id);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = (ev.clientX - dragRef.current.startX) / zoom;
      const dy = (ev.clientY - dragRef.current.startY) / zoom;
      updateBlock(block.id, { x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, origW: block.width, origH: block.height };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current.resizing) return;
      const dw = (ev.clientX - resizeRef.current.startX) / zoom;
      const dh = (ev.clientY - resizeRef.current.startY) / zoom;
      updateBlock(block.id, {
        width: Math.max(120, resizeRef.current.origW + dw),
        height: Math.max(60, resizeRef.current.origH + dh),
      });
    };
    const onUp = () => {
      resizeRef.current.resizing = false;
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderContent = () => {
    switch (block.type) {
      case 'note': return <NoteBlock block={block} readOnly={readOnly} />;
      case 'link': return <LinkBlock block={block} readOnly={readOnly} />;
      case 'todo': return <TodoBlock block={block} readOnly={readOnly} />;
      case 'image': return <ImageBlock block={block} readOnly={readOnly} />;
    }
  };

  return (
    <div
      className={`absolute block-base select-none ${isSelected && !readOnly ? 'ring-1 ring-foreground' : ''}`}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
      }}
      onMouseDown={handleDragStart}
    >
      {/* Header bar */}
      <div className={`flex items-center justify-between px-2 h-7 border-b border-border bg-secondary/50 ${readOnly ? '' : 'cursor-move'}`}>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          {block.type}
        </span>
        {!readOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="overflow-auto no-scrollbar" style={{ height: block.height - 28 }}>
        {renderContent()}
      </div>

      {/* Resize handle */}
      {!readOnly && (
        <div
          data-resize="true"
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize border-r-2 border-b-2 border-muted-foreground/40 hover:border-foreground transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
}
