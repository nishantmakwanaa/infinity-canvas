import { useCanvasStore, COLORS, FONT_MAP } from '@/store/canvasStore';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const DRAWING_TOOLS_WITH_SETTINGS = ['pencil', 'shape', 'line', 'arrow', 'text'];
const BLOCK_TYPES_WITH_STYLES = ['note', 'link', 'todo', 'media'];
const BLOCK_TYPES_WITH_FONTS = ['note', 'link', 'todo'];
const BLOCK_TYPES_WITH_TEXT_FORMATS = ['note', 'link', 'todo'];
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

interface ToolSettingsPanelProps {
  isMobile?: boolean;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export function ToolSettingsPanel({ isMobile = false, mobileOpen = false, onMobileOpenChange }: ToolSettingsPanelProps) {
  const { activeTool, toolSettings, setToolSettings, blocks, selectedBlockId, selectedBlockIds, updateBlock } = useCanvasStore();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  const activeSelectedBlockId = selectedBlockIds[0] || selectedBlockId;
  const selectedBlock = activeSelectedBlockId
    ? blocks.find((block) => block.id === activeSelectedBlockId) || null
    : null;

  const isDrawingSettingsMode = DRAWING_TOOLS_WITH_SETTINGS.includes(activeTool);
  const isBlockSettingsMode = Boolean(
    selectedBlock && BLOCK_TYPES_WITH_STYLES.includes(selectedBlock.type)
  );

  if (!isDrawingSettingsMode && !isBlockSettingsMode) return null;
  if (isMobile && !mobileOpen) return null;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => setIsDarkMode(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const applyToSelectedBlocks = (updates: Record<string, any>) => {
    const ids = selectedBlockIds.length
      ? selectedBlockIds
      : selectedBlockId
        ? [selectedBlockId]
        : [];
    ids.forEach((id) => updateBlock(id, updates));
  };

  const supportsFontSettings = Boolean(
    selectedBlock && BLOCK_TYPES_WITH_FONTS.includes(selectedBlock.type)
  );
  const supportsTextFormats = Boolean(
    selectedBlock && BLOCK_TYPES_WITH_TEXT_FORMATS.includes(selectedBlock.type)
  );

  const formatButtons = [
    {
      id: 'textBold',
      label: 'B',
      active: isBlockSettingsMode ? Boolean(selectedBlock?.textBold) : toolSettings.textBold,
      onToggle: () => {
        if (isBlockSettingsMode) {
          applyToSelectedBlocks({ textBold: !selectedBlock?.textBold });
          return;
        }
        setToolSettings({ textBold: !toolSettings.textBold });
      },
    },
    {
      id: 'textItalic',
      label: 'I',
      active: isBlockSettingsMode ? Boolean(selectedBlock?.textItalic) : toolSettings.textItalic,
      onToggle: () => {
        if (isBlockSettingsMode) {
          applyToSelectedBlocks({ textItalic: !selectedBlock?.textItalic });
          return;
        }
        setToolSettings({ textItalic: !toolSettings.textItalic });
      },
    },
    {
      id: 'textUnderline',
      label: 'U',
      active: isBlockSettingsMode ? Boolean(selectedBlock?.textUnderline) : toolSettings.textUnderline,
      onToggle: () => {
        if (isBlockSettingsMode) {
          applyToSelectedBlocks({ textUnderline: !selectedBlock?.textUnderline });
          return;
        }
        setToolSettings({ textUnderline: !toolSettings.textUnderline });
      },
    },
    {
      id: 'textHighlight',
      label: 'H',
      active: isBlockSettingsMode ? Boolean(selectedBlock?.textHighlight) : toolSettings.textHighlight,
      onToggle: () => {
        if (isBlockSettingsMode) {
          applyToSelectedBlocks({ textHighlight: !selectedBlock?.textHighlight });
          return;
        }
        setToolSettings({ textHighlight: !toolSettings.textHighlight });
      },
    },
  ];

  const panelClass = isMobile
    ? 'fixed bottom-[calc(1rem+88px)] right-3 z-[65] w-56 max-h-[56vh] overflow-auto border border-border bg-card p-3 space-y-3 shadow-lg animate-fade-in'
    : 'fixed top-16 right-4 z-50 w-56 border border-border bg-card p-3 space-y-3 animate-fade-in';

  const visibleColors = useMemo(
    () => COLORS.map((color) => (isDarkMode && color.toLowerCase() === '#000000' ? '#ffffff' : color)),
    [isDarkMode]
  );

  const sectionGridClass = 'grid grid-cols-4 gap-1.5 mt-1.5';
  const optionButtonClass = 'h-8 text-[10px] font-mono border transition-colors touch-manipulation';

  return (
    <div className={panelClass}>
      {isMobile && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Tool settings</span>
              <button
                className="w-6 h-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => onMobileOpenChange?.(false)}
              >
                <X size={12} />
              </button>
            </div>
      )}
      {isBlockSettingsMode && (
            <div>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Selected</span>
              <div className="mt-1 text-[10px] font-mono text-foreground uppercase tracking-widest">{selectedBlock?.type}</div>
            </div>
      )}

          {/* Colors */}
          <div>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
              {isBlockSettingsMode ? 'Background' : 'Color'}
            </span>
            <div className={sectionGridClass}>
              {visibleColors.map((c) => (
                <button
                  key={c}
                  className={`h-8 border transition-colors touch-manipulation ${
                    isBlockSettingsMode
                      ? (selectedBlock?.backgroundColor === c ? 'border-foreground' : 'border-border')
                      : (toolSettings.color === c ? 'border-foreground' : 'border-border')
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    if (isBlockSettingsMode) {
                      applyToSelectedBlocks({ backgroundColor: c });
                      return;
                    }
                    setToolSettings({ color: c });
                  }}
                />
              ))}
            </div>
          </div>

          {(isDrawingSettingsMode ? activeTool === 'text' : supportsTextFormats) && (
            <div>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Format</span>
              <div className={sectionGridClass}>
                {formatButtons.map((item) => (
                  <button
                    key={item.id}
                    className={`${optionButtonClass} ${
                      item.active
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-card text-foreground border-border hover:bg-accent'
                    } ${item.id === 'textItalic' ? 'italic' : ''} ${item.id === 'textUnderline' ? 'underline' : ''}`}
                    onClick={item.onToggle}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fonts */}
          {(isDrawingSettingsMode ? activeTool === 'text' : supportsFontSettings) && (
            <div>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Font</span>
              <div className={sectionGridClass}>
                {FONTS.map((f) => (
                  <button
                    key={f}
                    className={`${optionButtonClass} ${
                      isBlockSettingsMode
                        ? (selectedBlock?.fontFamily === f ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent')
                        : (toolSettings.fontFamily === f ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent')
                    }`}
                    style={{ fontFamily: FONT_MAP[f] }}
                    onClick={() => {
                      if (isBlockSettingsMode) {
                        applyToSelectedBlocks({ fontFamily: f });
                        return;
                      }
                      setToolSettings({ fontFamily: f });
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sizes */}
          {isDrawingSettingsMode && (
            <div>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Size</span>
              <div className={sectionGridClass}>
                {SIZES.map((s) => (
                  <button
                    key={s}
                    className={`${optionButtonClass} ${toolSettings.size === s ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent'}`}
                    onClick={() => setToolSettings({ size: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shape type */}
          {isDrawingSettingsMode && activeTool === 'shape' && (
            <div>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Shape</span>
              <div className={sectionGridClass}>
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    className={`h-8 flex items-center justify-center border transition-colors touch-manipulation ${toolSettings.shapeType === s.id ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-accent'}`}
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
