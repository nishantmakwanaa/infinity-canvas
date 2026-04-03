import React, { useRef, useCallback, useEffect } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { CanvasBlockComponent } from './CanvasBlock';

export function InfiniteCanvas() {
  const { blocks, pan, zoom, setPan, setZoom, selectBlock } = useCanvasStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.002;
        setZoom(zoom * (1 + delta));
      } else {
        setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
      }
    },
    [pan, zoom, setPan, setZoom]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).dataset.canvas) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      selectBlock(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan({ x: pan.x + dx, y: pan.y + dy });
  };

  const handleMouseUp = () => {
    isPanning.current = false;
  };

  const dotOffset = {
    backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
  };

  return (
    <div
      ref={containerRef}
      data-canvas="true"
      className="fixed inset-0 canvas-dots overflow-hidden cursor-grab active:cursor-grabbing select-none"
      style={dotOffset}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        data-canvas="true"
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {blocks.map((block) => (
          <CanvasBlockComponent key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}
