import { useEffect, useRef, useState } from 'react';
import { useCanvasStore, type BlockType } from '@/store/canvasStore';
import { StickyNote, Link, CheckSquare, Film, Pencil, Eraser, Type, Square, Minus, ArrowRight, ZoomIn, ZoomOut, Maximize, MousePointer2 } from 'lucide-react';

interface ToolbarProps {
  leftOffsetPercent?: number;
  isMobile?: boolean;
}

export function Toolbar({ leftOffsetPercent = 0, isMobile = false }: ToolbarProps) {
  const { addBlock, zoom, setZoom, setPan, activeTool, setActiveTool } = useCanvasStore();
  const zoomRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const [hideZoomForOverlap, setHideZoomForOverlap] = useState(false);

  const blockTools = [
    { icon: StickyNote, id: 'note' as const, label: 'Note' },
    { icon: Link, id: 'link' as const, label: 'Link' },
    { icon: CheckSquare, id: 'todo' as const, label: 'Todo' },
    { icon: Film, id: 'media' as const, label: 'Media' },
  ];

  const drawTools = [
    { icon: Pencil, id: 'pencil' as const, label: 'Pencil' },
    { icon: Eraser, id: 'eraser' as const, label: 'Eraser' },
    { icon: Type, id: 'text' as const, label: 'Text' },
    { icon: Square, id: 'shape' as const, label: 'Shape' },
    { icon: Minus, id: 'line' as const, label: 'Line' },
    { icon: ArrowRight, id: 'arrow' as const, label: 'Arrow' },
  ];

  const handleBlockTool = (type: BlockType) => {
    const canvasLeftPx = (leftOffsetPercent / 100) * window.innerWidth;
    const canvasWidth = window.innerWidth - canvasLeftPx;
    const cx = (canvasLeftPx + canvasWidth / 2 - useCanvasStore.getState().pan.x) / zoom;
    const cy = (window.innerHeight / 2 - useCanvasStore.getState().pan.y) / zoom;
    addBlock(type, cx - 120, cy - 80);
  };

  const toolbarCenterPercent = leftOffsetPercent + (100 - leftOffsetPercent) / 2;
  const selectorBottom = '1rem';
  const selectorHeight = isMobile ? 36 : 44;
  const zoomHeight = 40;
  const zoomBottom = `calc(${selectorBottom} + ${(selectorHeight - zoomHeight) / 2}px)`;

  useEffect(() => {
    if (isMobile) {
      setHideZoomForOverlap(true);
      return;
    }

    const checkOverlap = () => {
      const zoomEl = zoomRef.current;
      const selectorEl = selectorRef.current;
      if (!zoomEl || !selectorEl) {
        setHideZoomForOverlap(false);
        return;
      }

      const zoomRect = zoomEl.getBoundingClientRect();
      const selectorRect = selectorEl.getBoundingClientRect();
      const verticallyAligned = !(zoomRect.bottom < selectorRect.top || selectorRect.bottom < zoomRect.top);
      const horizontallyOverlapping = zoomRect.right >= selectorRect.left - 8;
      setHideZoomForOverlap(verticallyAligned && horizontallyOverlapping);
    };

    const raf = requestAnimationFrame(checkOverlap);
    window.addEventListener('resize', checkOverlap);

    const observer = new ResizeObserver(checkOverlap);
    if (zoomRef.current) observer.observe(zoomRef.current);
    if (selectorRef.current) observer.observe(selectorRef.current);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', checkOverlap);
      observer.disconnect();
    };
  }, [isMobile, leftOffsetPercent]);

  return (
    <>
      {/* Zoom controls - left side */}
      {!isMobile && !hideZoomForOverlap && (
        <div
          ref={zoomRef}
          className="fixed z-50 flex items-center gap-px border border-border bg-card"
          style={{ left: `calc(${leftOffsetPercent}% + 1rem)`, bottom: zoomBottom }}
        >
          <button className="inline-flex items-center justify-center w-10 h-10 text-foreground hover:bg-accent transition-colors" title="Zoom out" onClick={() => setZoom(zoom - 0.15)}>
            <ZoomOut size={16} />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
          <button className="inline-flex items-center justify-center w-10 h-10 text-foreground hover:bg-accent transition-colors" title="Zoom in" onClick={() => setZoom(zoom + 0.15)}>
            <ZoomIn size={16} />
          </button>
          <button className="inline-flex items-center justify-center w-10 h-10 text-foreground hover:bg-accent transition-colors border-l border-border" title="Reset" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
            <Maximize size={16} />
          </button>
        </div>
      )}

      {/* Main toolbar - center */}
      <div
        ref={selectorRef}
        className="fixed -translate-x-1/2 z-50 flex max-w-[calc(100vw-1rem)] overflow-x-auto no-scrollbar items-center gap-px border border-border bg-card shadow-lg"
        style={{ left: `${toolbarCenterPercent}%`, bottom: selectorBottom }}
      >
        <button
          className={`inline-flex items-center justify-center ${isMobile ? 'w-9 h-9' : 'w-11 h-11'} border-r border-border transition-colors ${activeTool === 'select' ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
          title="Cursor"
          onClick={() => setActiveTool('select')}
        >
          <MousePointer2 size={isMobile ? 15 : 18} />
        </button>
        {blockTools.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            className={`inline-flex items-center justify-center ${isMobile ? 'w-9 h-9' : 'w-11 h-11'} border-r border-border transition-colors ${activeTool === id ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
            title={label}
            onClick={() => handleBlockTool(id)}
          >
            <Icon size={isMobile ? 15 : 18} />
          </button>
        ))}
        {drawTools.map(({ icon: Icon, id, label }, index) => (
          <button
            key={id}
            className={`inline-flex items-center justify-center ${isMobile ? 'w-9 h-9' : 'w-11 h-11'} transition-colors ${index < drawTools.length - 1 ? 'border-r border-border' : ''} ${activeTool === id ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
            title={label}
            onClick={() => setActiveTool(activeTool === id ? 'select' : id)}
          >
            <Icon size={isMobile ? 15 : 18} />
          </button>
        ))}
      </div>
    </>
  );
}
