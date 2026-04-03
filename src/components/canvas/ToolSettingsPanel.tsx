import { useCanvasStore, COLORS, FONT_MAP } from '@/store/canvasStore';

const DRAWING_TOOLS_WITH_SETTINGS = ['pencil', 'shape', 'line', 'arrow', 'text'];
const SIZES = ['S', 'M', 'L', 'XL'] as const;
const FONTS = ['default', 'sans', 'serif', 'mono'] as const;
const SHAPES = [
  { id: 'rectangle', label: 'Rect' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'oval', label: 'Oval' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'star', label: 'Star' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'heart', label: 'Heart' },
] as const;

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
                className={`h-7 text-[10px] font-mono border transition-colors ${toolSettings.shapeType === s.id ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent'}`}
                onClick={() => setToolSettings({ shapeType: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
