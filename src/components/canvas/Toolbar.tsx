import { useCanvasStore } from '@/store/canvasStore';
import { StickyNote, Link, CheckSquare, ImageIcon, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

export function Toolbar() {
  const { addBlock, zoom, setZoom, setPan } = useCanvasStore();

  const tools = [
    { icon: StickyNote, type: 'note' as const, label: 'Note' },
    { icon: Link, type: 'link' as const, label: 'Link' },
    { icon: CheckSquare, type: 'todo' as const, label: 'Todo' },
    { icon: ImageIcon, type: 'image' as const, label: 'Image' },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-px border border-border bg-card animate-fade-in">
      {tools.map(({ icon: Icon, type, label }) => (
        <button
          key={type}
          className="toolbar-btn"
          title={label}
          onClick={() => {
            const cx = (window.innerWidth / 2 - useCanvasStore.getState().pan.x) / zoom;
            const cy = (window.innerHeight / 2 - useCanvasStore.getState().pan.y) / zoom;
            addBlock(type, cx - 120, cy - 80);
          }}
        >
          <Icon size={16} />
        </button>
      ))}

      <div className="w-px h-5 bg-border mx-1" />

      <button className="toolbar-btn" title="Zoom out" onClick={() => setZoom(zoom - 0.15)}>
        <ZoomOut size={16} />
      </button>
      <span className="text-[10px] font-mono text-muted-foreground w-10 text-center select-none">
        {Math.round(zoom * 100)}%
      </span>
      <button className="toolbar-btn" title="Zoom in" onClick={() => setZoom(zoom + 0.15)}>
        <ZoomIn size={16} />
      </button>
      <button className="toolbar-btn" title="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
        <Maximize size={16} />
      </button>
    </div>
  );
}
