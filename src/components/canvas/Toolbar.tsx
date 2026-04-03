import { useCanvasStore, type BlockType } from '@/store/canvasStore';
import { StickyNote, Link, CheckSquare, Film, Pencil, Eraser, Type, Square, Minus, ArrowRight, ZoomIn, ZoomOut, Maximize, MousePointer2 } from 'lucide-react';

export function Toolbar() {
  const { addBlock, zoom, setZoom, setPan, activeTool, setActiveTool } = useCanvasStore();

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
    const cx = (window.innerWidth / 2 - useCanvasStore.getState().pan.x) / zoom;
    const cy = (window.innerHeight / 2 - useCanvasStore.getState().pan.y) / zoom;
    addBlock(type, cx - 120, cy - 80);
  };

  return (
    <>
      {/* Zoom controls - left side */}
      <div className="fixed bottom-6 left-4 z-50 flex items-center gap-px border border-border bg-card">
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

      {/* Main toolbar - center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-px border border-border bg-card shadow-lg">
        <button
          className={`inline-flex items-center justify-center w-11 h-11 border-r border-border transition-colors ${activeTool === 'select' ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
          title="Cursor"
          onClick={() => setActiveTool('select')}
        >
          <MousePointer2 size={18} />
        </button>
        {blockTools.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            className={`inline-flex items-center justify-center w-11 h-11 border-r border-border transition-colors ${activeTool === id ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
            title={label}
            onClick={() => handleBlockTool(id)}
          >
            <Icon size={18} />
          </button>
        ))}
        <div className="w-px h-6 bg-border mx-0.5" />
        {drawTools.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            className={`inline-flex items-center justify-center w-11 h-11 transition-colors ${activeTool === id ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
            title={label}
            onClick={() => setActiveTool(activeTool === id ? 'select' : id)}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </>
  );
}
