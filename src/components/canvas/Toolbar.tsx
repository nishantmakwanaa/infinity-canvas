import { useCanvasStore } from '@/store/canvasStore';
import { StickyNote, Link, CheckSquare, ImageIcon, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useState } from 'react';

export function Toolbar() {
  const { addBlock, zoom, setZoom, setPan } = useCanvasStore();
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const tools = [
    { icon: StickyNote, type: 'note' as const, label: 'Note' },
    { icon: Link, type: 'link' as const, label: 'Link' },
    { icon: CheckSquare, type: 'todo' as const, label: 'Todo' },
    { icon: ImageIcon, type: 'image' as const, label: 'Image' },
  ];

  const handleToolClick = (type: typeof tools[number]['type']) => {
    setActiveTool(type);
    const cx = (window.innerWidth / 2 - useCanvasStore.getState().pan.x) / zoom;
    const cy = (window.innerHeight / 2 - useCanvasStore.getState().pan.y) / zoom;
    addBlock(type, cx - 120, cy - 80);
    setTimeout(() => setActiveTool(null), 300);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-px border border-border bg-card shadow-lg animate-fade-in">
      {tools.map(({ icon: Icon, type, label }) => (
        <button
          key={type}
          className={`inline-flex items-center justify-center w-11 h-11 border-r border-border transition-colors ${
            activeTool === type
              ? 'bg-foreground text-background'
              : 'bg-card text-foreground hover:bg-accent'
          }`}
          title={label}
          onClick={() => handleToolClick(type)}
        >
          <Icon size={18} />
        </button>
      ))}

      <div className="w-px h-6 bg-border mx-1" />

      <button
        className="inline-flex items-center justify-center w-10 h-11 text-foreground hover:bg-accent transition-colors"
        title="Zoom out"
        onClick={() => setZoom(zoom - 0.15)}
      >
        <ZoomOut size={16} />
      </button>
      <span className="text-[10px] font-mono text-muted-foreground w-10 text-center select-none">
        {Math.round(zoom * 100)}%
      </span>
      <button
        className="inline-flex items-center justify-center w-10 h-11 text-foreground hover:bg-accent transition-colors"
        title="Zoom in"
        onClick={() => setZoom(zoom + 0.15)}
      >
        <ZoomIn size={16} />
      </button>
      <button
        className="inline-flex items-center justify-center w-10 h-11 text-foreground hover:bg-accent transition-colors border-l border-border"
        title="Reset view"
        onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
      >
        <Maximize size={16} />
      </button>
    </div>
  );
}
