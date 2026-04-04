import { useEffect, useRef, useState } from 'react';
import { useCanvasStore, type BlockType } from '@/store/canvasStore';
import { StickyNote, Link, CheckSquare, Film, Pencil, Eraser, Type, Square, Minus, ArrowRight, Maximize, MousePointer2, Hand, ChevronUp, ChevronDown, SlidersHorizontal, Undo2, Redo2, Copy, Scissors, Trash2 } from 'lucide-react';

const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8] as const;

interface ToolbarProps {
  leftOffsetPercent?: number;
  isMobile?: boolean;
  allowedToolIds?: string[];
  showMobileSettingsButton?: boolean;
  isMobileSettingsOpen?: boolean;
  onToggleMobileSettings?: () => void;
  onOpenMobileSettings?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onDelete?: () => void;
}

export function Toolbar({
  leftOffsetPercent = 0,
  isMobile = false,
  allowedToolIds,
  showMobileSettingsButton = false,
  isMobileSettingsOpen = false,
  onToggleMobileSettings,
  onOpenMobileSettings,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onDelete,
}: ToolbarProps) {
  const { addBlock, zoom, setZoom, setPan, activeTool, setActiveTool } = useCanvasStore();
  const zoomRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const [hideZoomForOverlap, setHideZoomForOverlap] = useState(false);
  const [showMobileOverflow, setShowMobileOverflow] = useState(false);
  const [zoomExpanded, setZoomExpanded] = useState(false);

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

  const allTools = [
    { icon: MousePointer2, id: 'select' as const, label: 'Cursor', kind: 'select' as const },
    { icon: Hand, id: 'hand' as const, label: 'Hand', kind: 'select' as const },
    ...blockTools.map((tool) => ({ ...tool, kind: 'block' as const })),
    ...drawTools.map((tool) => ({ ...tool, kind: 'draw' as const })),
  ];
  const visibleTools = Array.isArray(allowedToolIds) && allowedToolIds.length
    ? allTools.filter((tool) => allowedToolIds.includes(tool.id))
    : allTools;

  const toolsThatNeedSettings = new Set(['pencil', 'shape', 'line', 'arrow', 'text', 'note', 'link', 'todo', 'media']);

  const hasMobileSettingsButton = isMobile && showMobileSettingsButton && Boolean(onToggleMobileSettings);
  const mobileToolSlotCount = isMobile ? 7 : visibleTools.length;
  const mobilePrimaryTools = isMobile ? visibleTools.slice(0, mobileToolSlotCount) : visibleTools;
  const mobileOverflowTools = isMobile ? visibleTools.slice(mobileToolSlotCount) : [];
  const hasActionBar = Boolean(onUndo || onRedo || onCopy || onCut || onDelete);

  const handleBlockTool = (type: BlockType) => {
    const canvasLeftPx = (leftOffsetPercent / 100) * window.innerWidth;
    const canvasWidth = window.innerWidth - canvasLeftPx;
    const cx = (canvasLeftPx + canvasWidth / 2 - useCanvasStore.getState().pan.x) / zoom;
    const cy = (window.innerHeight / 2 - useCanvasStore.getState().pan.y) / zoom;
    addBlock(type, cx - 120, cy - 80);
  };

  const zoomPercentLabel = `${Math.round(zoom * 100)}%`;

  const zoomInByStep = () => {
    const next = ZOOM_STEPS.find((step) => step > zoom + 0.0001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    setZoom(next);
  };

  const zoomOutByStep = () => {
    const previous = [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.0001) ?? ZOOM_STEPS[0];
    setZoom(previous);
  };

  const toolbarCenterPercent = leftOffsetPercent + (100 - leftOffsetPercent) / 2;
  const selectorBottom = isMobile ? 'calc(1rem + env(safe-area-inset-bottom, 0px))' : '1rem';
  const selectorHeight = isMobile ? 36 : 44;
  const zoomHeight = 40;
  const zoomBottom = `calc(${selectorBottom} + ${(selectorHeight - zoomHeight) / 2}px)`;
  const actionBarBottom = isMobile
    ? 'calc(1rem + env(safe-area-inset-bottom, 0px) + 48px)'
    : 'calc(1rem + 52px)';

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

  useEffect(() => {
    if (!isMobile) setShowMobileOverflow(false);
  }, [isMobile]);

  const renderToolButton = (tool: { icon: any; id: string; label: string; kind: 'select' | 'block' | 'draw' }, withRightBorder = true) => {
    const Icon = tool.icon;
    const isActive = activeTool === tool.id;
    return (
      <button
        key={tool.id}
        className={`inline-flex items-center justify-center ${isMobile ? 'w-9 h-9' : 'w-11 h-11'} ${withRightBorder ? 'border-r border-border' : ''} transition-colors ${isActive ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
        title={tool.label}
        onClick={() => {
          if (tool.kind === 'block') {
            handleBlockTool(tool.id as BlockType);
          } else if (tool.kind === 'draw') {
            setActiveTool(tool.id as any);
          } else {
            setActiveTool(tool.id as any);
          }

          if (isMobile && onOpenMobileSettings && toolsThatNeedSettings.has(tool.id)) {
            onOpenMobileSettings();
          }

          if (isMobile) setShowMobileOverflow(false);
        }}
      >
        <Icon size={isMobile ? 15 : 18} />
      </button>
    );
  };

  return (
    <>
      {/* Zoom controls - left side */}
      {!isMobile && !hideZoomForOverlap && (
        <div
          ref={zoomRef}
          className="fixed z-50 flex items-center gap-px border border-border bg-card"
          style={{ left: `calc(${leftOffsetPercent}% + 1rem)`, bottom: zoomBottom }}
        >
          {zoomExpanded ? (
            <>
              <button
                className="inline-flex items-center justify-center w-10 h-10 text-sm font-mono text-foreground hover:bg-accent transition-colors"
                title="Zoom out"
                onClick={zoomOutByStep}
              >
                -
              </button>
              <span className="text-[10px] font-mono text-muted-foreground w-12 text-center select-none">{zoomPercentLabel}</span>
              <button
                className="inline-flex items-center justify-center w-10 h-10 text-sm font-mono text-foreground hover:bg-accent transition-colors"
                title="Zoom in"
                onClick={zoomInByStep}
              >
                +
              </button>
            </>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground w-14 text-center select-none">{zoomPercentLabel}</span>
          )}
          <button
            className="inline-flex items-center justify-center w-10 h-10 text-foreground hover:bg-accent transition-colors border-l border-border"
            title={zoomExpanded ? 'Collapse zoom controls' : 'Expand zoom controls'}
            onClick={() => setZoomExpanded((prev) => !prev)}
          >
            <Maximize size={16} />
          </button>
        </div>
      )}

      {/* Main toolbar - center */}
      {isMobile ? (
        <div
          className="fixed -translate-x-1/2 z-50 flex flex-col items-center gap-1"
          style={{ left: `${toolbarCenterPercent}%`, bottom: selectorBottom }}
        >
          {hasActionBar && (
            <div className="flex items-center gap-px border border-border bg-accent/60 shadow-md">
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Undo" onClick={onUndo}>
                <Undo2 size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Redo" onClick={onRedo}>
                <Redo2 size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Copy" onClick={onCopy}>
                <Copy size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Cut" onClick={onCut}>
                <Scissors size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors" title="Delete" onClick={onDelete}>
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {showMobileOverflow && mobileOverflowTools.length > 0 && (
            <div className="grid grid-cols-4 gap-px border border-border bg-card shadow-lg">
              {mobileOverflowTools.map((tool, index) => renderToolButton(tool, index % 4 !== 3))}
            </div>
          )}

          <div className="flex items-center gap-1">
            <div
              ref={selectorRef}
              className="flex items-center gap-px border border-border bg-card shadow-lg"
            >
              {mobilePrimaryTools.map((tool, index) => {
                const hasTailButtons = mobileOverflowTools.length > 0;
                return renderToolButton(tool, index < mobilePrimaryTools.length - 1 || hasTailButtons);
              })}

              {mobileOverflowTools.length > 0 && (
                <button
                  className={`inline-flex items-center justify-center w-9 h-9 transition-colors ${showMobileOverflow ? 'bg-foreground text-background' : 'bg-card text-foreground hover:bg-accent'}`}
                  title="More tools"
                  onClick={() => setShowMobileOverflow((prev) => !prev)}
                >
                  {showMobileOverflow ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
              )}
            </div>

            {hasMobileSettingsButton && (
              <button
                className={`inline-flex items-center justify-center w-9 h-9 border border-border shadow-lg transition-colors ${isMobileSettingsOpen ? 'bg-white text-black' : 'bg-white text-black hover:opacity-90'}`}
                title="Tool settings"
                onClick={onToggleMobileSettings}
              >
                <SlidersHorizontal size={15} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div
            ref={selectorRef}
            className="fixed -translate-x-1/2 z-50 flex max-w-[calc(100vw-1rem)] overflow-x-auto no-scrollbar items-center gap-px border border-border bg-card shadow-lg"
            style={{ left: `${toolbarCenterPercent}%`, bottom: selectorBottom }}
          >
            {mobilePrimaryTools.map((tool, index) => renderToolButton(tool, index < mobilePrimaryTools.length - 1))}
          </div>

          {hasActionBar && (
            <div
              className="fixed -translate-x-1/2 z-50 flex items-center gap-px border border-border bg-accent/60 shadow-md"
              style={{ left: `${toolbarCenterPercent}%`, bottom: actionBarBottom }}
            >
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Undo" onClick={onUndo}>
                <Undo2 size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Redo" onClick={onRedo}>
                <Redo2 size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Copy" onClick={onCopy}>
                <Copy size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors border-r border-border" title="Cut" onClick={onCut}>
                <Scissors size={14} />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-7 text-foreground hover:bg-accent transition-colors" title="Delete" onClick={onDelete}>
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
