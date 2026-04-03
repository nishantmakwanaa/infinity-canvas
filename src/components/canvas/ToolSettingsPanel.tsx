import { useCanvasStore, COLORS, FONT_MAP } from '@/store/canvasStore';

const DRAWING_TOOLS_WITH_SETTINGS = ['pencil', 'shape', 'line', 'arrow', 'text'];
const SIZES = ['S', 'M', 'L', 'XL'] as const;
const FONTS = ['default', 'sans', 'serif', 'mono'] as const;
const SHAPES = [
  { id: 'rectangle' },
  { id: 'ellipse' },
  { id: 'triangle' },
  { id: 'hexagon' },
  { id: 'oval' },
  { id: 'diamond' },
  { id: 'star' },
  { id: 'cloud' },
  { id: 'heart' },
] as const;

function ShapeIcon({ id }: { id: string }) {
  const common = { stroke: 'currentColor', strokeWidth: 1.8, fill: 'none' as const, vectorEffect: 'non-scaling-stroke' as const };
  switch (id) {
    case 'rectangle':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><rect x="5" y="6" width="14" height="12" rx="1.5" {...common} /></svg>;
    case 'ellipse':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><ellipse cx="12" cy="12" rx="7" ry="5.5" {...common} /></svg>;
    case 'triangle':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M12 6 L19 18 H5 Z" {...common} /></svg>;
    case 'hexagon':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M8 6 H16 L20 12 L16 18 H8 L4 12 Z" {...common} /></svg>;
    case 'oval':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M5 12 C5 8.5 8.5 6 12 6 C15.5 6 19 8.5 19 12 C19 15.5 15.5 18 12 18 C8.5 18 5 15.5 5 12 Z" {...common} /></svg>;
    case 'diamond':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M12 5 L19 12 L12 19 L5 12 Z" {...common} /></svg>;
    case 'star':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M12 4 L14.6 9.2 L20.3 9.9 L16.1 13.7 L17.2 19.3 L12 16.6 L6.8 19.3 L7.9 13.7 L3.7 9.9 L9.4 9.2 Z" {...common} /></svg>;
    case 'cloud':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M8.5 18h8a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7 1.7A3.2 3.2 0 0 0 8.5 18Z" {...common} /></svg>;
    case 'heart':
      return <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.2 3.1 5.7 6 5.7c1.7 0 3.1.9 4 2.2.9-1.3 2.3-2.2 4-2.2 2.9 0 4.7 2.5 3.2 5.7C19 15.6 12 20 12 20Z" {...common} /></svg>;
    default:
      return null;
  }
}

export function ToolSettingsPanel() {
  const { activeTool, toolSettings, setToolSettings } = useCanvasStore();

  if (!DRAWING_TOOLS_WITH_SETTINGS.includes(activeTool)) return null;

  return (
    <div className="fixed top-16 right-4 z-50 w-52 border border-border bg-card p-3 space-y-3 animate-fade-in">
      {/* Colors */}
      <div>
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Color</span>
        <div className="grid grid-cols-6 gap-1.5 mt-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`w-6 h-6 border transition-all ${toolSettings.color === c ? 'border-foreground scale-110' : 'border-border'}`}
              style={{ backgroundColor: c }}
              onClick={() => setToolSettings({ color: c })}
            />
          ))}
        </div>
      </div>

      {/* Fonts */}
      {(activeTool === 'text') && (
        <div>
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Font</span>
          <div className="flex gap-1 mt-1.5">
            {FONTS.map((f) => (
              <button
                key={f}
                className={`flex-1 h-7 text-[10px] border transition-colors ${toolSettings.fontFamily === f ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent'}`}
                style={{ fontFamily: FONT_MAP[f] }}
                onClick={() => setToolSettings({ fontFamily: f })}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sizes */}
      <div>
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Size</span>
        <div className="flex gap-1 mt-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              className={`flex-1 h-7 text-[10px] font-mono border transition-colors ${toolSettings.size === s ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent'}`}
              onClick={() => setToolSettings({ size: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Shape type */}
      {activeTool === 'shape' && (
        <div>
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Shape</span>
          <div className="grid grid-cols-3 gap-1 mt-1.5">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                className={`h-8 flex items-center justify-center border transition-colors ${toolSettings.shapeType === s.id ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent'}`}
                onClick={() => setToolSettings({ shapeType: s.id })}
                title={s.id}
              >
                <ShapeIcon id={s.id} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
