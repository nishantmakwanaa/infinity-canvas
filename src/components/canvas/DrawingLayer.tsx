import React, { useRef, useState, useCallback } from 'react';
import { useCanvasStore, DrawingElement, SIZE_MAP, FONT_MAP, genId } from '@/store/canvasStore';

const DRAWING_TOOLS = ['pencil', 'eraser', 'text', 'shape', 'line', 'arrow'];

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function shapePath(type: string, x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(1, w / 2);
  const ry = Math.max(1, h / 2);
  switch (type) {
    case 'triangle':
      return `M ${cx} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    case 'hexagon': {
      const dx = w * 0.25;
      return `M ${x + dx} ${y} L ${x + w - dx} ${y} L ${x + w} ${cy} L ${x + w - dx} ${y + h} L ${x + dx} ${y + h} L ${x} ${cy} Z`;
    }
    case 'oval':
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    case 'diamond':
      return `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`;
    case 'star': {
      const outer = Math.min(rx, ry);
      const inner = outer * 0.45;
      const points: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const angle = -Math.PI / 2 + i * (Math.PI / 5);
        const r = i % 2 === 0 ? outer : inner;
        points.push(`${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`);
      }
      return `M ${points[0]} L ${points.slice(1).join(' L ')} Z`;
    }
    case 'cloud': {
      const p1 = `${x + w * 0.18} ${y + h * 0.7}`;
      return [
        `M ${p1}`,
        `C ${x + w * 0.05} ${y + h * 0.7}, ${x + w * 0.05} ${y + h * 0.45}, ${x + w * 0.22} ${y + h * 0.45}`,
        `C ${x + w * 0.2} ${y + h * 0.2}, ${x + w * 0.45} ${y + h * 0.1}, ${x + w * 0.58} ${y + h * 0.3}`,
        `C ${x + w * 0.78} ${y + h * 0.2}, ${x + w * 0.95} ${y + h * 0.38}, ${x + w * 0.88} ${y + h * 0.58}`,
        `C ${x + w * 0.95} ${y + h * 0.7}, ${x + w * 0.8} ${y + h * 0.85}, ${x + w * 0.65} ${y + h * 0.8}`,
        `L ${x + w * 0.3} ${y + h * 0.8}`,
        `C ${x + w * 0.24} ${y + h * 0.84}, ${x + w * 0.14} ${y + h * 0.8}, ${x + w * 0.18} ${y + h * 0.7}`,
        'Z',
      ].join(' ');
    }
    case 'heart':
      return [
        `M ${cx} ${y + h * 0.9}`,
        `C ${x + w * 0.1} ${y + h * 0.62}, ${x + w * 0.03} ${y + h * 0.3}, ${x + w * 0.24} ${y + h * 0.2}`,
        `C ${x + w * 0.4} ${y + h * 0.12}, ${cx} ${y + h * 0.24}, ${cx} ${y + h * 0.35}`,
        `C ${cx} ${y + h * 0.24}, ${x + w * 0.6} ${y + h * 0.12}, ${x + w * 0.76} ${y + h * 0.2}`,
        `C ${x + w * 0.97} ${y + h * 0.3}, ${x + w * 0.9} ${y + h * 0.62}, ${cx} ${y + h * 0.9}`,
        'Z',
      ].join(' ');
    default:
      return '';
  }
}

function DrawingElementRenderer({ element, onDelete }: { element: DrawingElement; onDelete?: (id: string) => void }) {
  const common = { onClick: onDelete ? () => onDelete(element.id) : undefined };

  switch (element.type) {
    case 'freehand':
      return <path d={pointsToPath(element.points)} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...common} style={onDelete ? { cursor: 'pointer' } : {}} />;
    case 'rectangle':
      return <rect x={element.x} y={element.y} width={element.w} height={element.h} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} {...common} style={onDelete ? { cursor: 'pointer' } : {}} />;
    case 'ellipse':
      return <ellipse cx={element.x + element.w / 2} cy={element.y + element.h / 2} rx={Math.abs(element.w) / 2} ry={Math.abs(element.h) / 2} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} {...common} style={onDelete ? { cursor: 'pointer' } : {}} />;
    case 'triangle':
    case 'hexagon':
    case 'oval':
    case 'diamond':
    case 'star':
    case 'cloud':
    case 'heart':
      return <path d={shapePath(element.type, element.x, element.y, Math.abs(element.w), Math.abs(element.h))} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} {...common} style={onDelete ? { cursor: 'pointer' } : {}} />;
    case 'text':
      return <text x={element.x} y={element.y} fill={element.color} fontSize={element.fontSize} fontFamily={element.fontFamily} {...common} style={onDelete ? { cursor: 'pointer' } : {}}>{element.content}</text>;
    case 'line':
      return <line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" {...common} style={onDelete ? { cursor: 'pointer' } : {}} />;
    case 'arrow': {
      const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1);
      const headLen = 12;
      const ax1 = element.x2 - headLen * Math.cos(angle - Math.PI / 6);
      const ay1 = element.y2 - headLen * Math.sin(angle - Math.PI / 6);
      const ax2 = element.x2 - headLen * Math.cos(angle + Math.PI / 6);
      const ay2 = element.y2 - headLen * Math.sin(angle + Math.PI / 6);
      return (
        <g {...common} style={onDelete ? { cursor: 'pointer' } : {}}>
          <line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" />
          <line x1={element.x2} y1={element.y2} x2={ax1} y2={ay1} stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" />
          <line x1={element.x2} y1={element.y2} x2={ax2} y2={ay2} stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" />
        </g>
      );
    }
  }
}

export function DrawingLayer({ readOnly, leftOffsetPercent = 0 }: { readOnly?: boolean; leftOffsetPercent?: number }) {
  const { drawingElements, activeTool, toolSettings, pan, zoom, addDrawingElement, deleteDrawingElement } = useCanvasStore();
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const isDrawing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<SVGSVGElement>(null);

  const isActive = DRAWING_TOOLS.includes(activeTool) && !readOnly;

  const toCanvas = useCallback((e: React.MouseEvent) => {
    const rect = layerRef.current?.getBoundingClientRect();
    const left = rect?.left || 0;
    const top = rect?.top || 0;
    return {
      x: (e.clientX - left - pan.x) / zoom,
      y: (e.clientY - top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const strokeW = SIZE_MAP[toolSettings.size].stroke;
  const fontSize = SIZE_MAP[toolSettings.size].text;
  const fontFamily = FONT_MAP[toolSettings.fontFamily];

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isActive) return;
    const pos = toCanvas(e);

    if (activeTool === 'pencil') {
      isDrawing.current = true;
      setCurrentPath([pos]);
    } else if (activeTool === 'eraser') {
      // handled via element click
    } else if (activeTool === 'text') {
      setTextPos(pos);
      setTextValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (activeTool === 'shape' || activeTool === 'line' || activeTool === 'arrow') {
      isDrawing.current = true;
      setDrawStart(pos);
      setDrawEnd(pos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isActive || !isDrawing.current) return;
    const pos = toCanvas(e);
    if (activeTool === 'pencil') {
      setCurrentPath(p => [...p, pos]);
    } else if (activeTool === 'shape' || activeTool === 'line' || activeTool === 'arrow') {
      setDrawEnd(pos);
    }
  };

  const handleMouseUp = () => {
    if (!isActive || !isDrawing.current) return;
    isDrawing.current = false;

    if (activeTool === 'pencil' && currentPath.length > 1) {
      addDrawingElement({ id: genId(), type: 'freehand', points: currentPath, color: toolSettings.color, strokeWidth: strokeW });
      setCurrentPath([]);
    } else if (activeTool === 'shape' && drawStart && drawEnd) {
      const x = Math.min(drawStart.x, drawEnd.x);
      const y = Math.min(drawStart.y, drawEnd.y);
      const w = Math.abs(drawEnd.x - drawStart.x);
      const h = Math.abs(drawEnd.y - drawStart.y);
      if (w > 2 || h > 2) {
        addDrawingElement({ id: genId(), type: toolSettings.shapeType, x, y, w, h, color: toolSettings.color, strokeWidth: strokeW });
      }
      setDrawStart(null);
      setDrawEnd(null);
    } else if ((activeTool === 'line' || activeTool === 'arrow') && drawStart && drawEnd) {
      const dist = Math.hypot(drawEnd.x - drawStart.x, drawEnd.y - drawStart.y);
      if (dist > 2) {
        addDrawingElement({ id: genId(), type: activeTool, x1: drawStart.x, y1: drawStart.y, x2: drawEnd.x, y2: drawEnd.y, color: toolSettings.color, strokeWidth: strokeW });
      }
      setDrawStart(null);
      setDrawEnd(null);
    }
  };

  const handleTextSubmit = () => {
    if (textPos && textValue.trim()) {
      addDrawingElement({ id: genId(), type: 'text', x: textPos.x, y: textPos.y, content: textValue.trim(), color: toolSettings.color, fontSize, fontFamily });
    }
    setTextPos(null);
    setTextValue('');
  };

  const getCursor = () => {
    switch (activeTool) {
      case 'pencil': return 'crosshair';
      case 'eraser': return 'pointer';
      case 'text': return 'text';
      default: return 'crosshair';
    }
  };

  return (
    <>
      <svg
        ref={layerRef}
        data-drawing-layer="true"
        className={`fixed top-0 bottom-0 right-0 ${isActive ? 'z-10' : 'z-[5] pointer-events-none'}`}
        style={{ left: `${leftOffsetPercent}%`, width: 'auto', height: '100%', cursor: isActive ? getCursor() : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {drawingElements.map((el) => (
            <DrawingElementRenderer
              key={el.id}
              element={el}
              onDelete={activeTool === 'eraser' && isActive ? deleteDrawingElement : undefined}
            />
          ))}

          {/* Preview: pencil */}
          {activeTool === 'pencil' && currentPath.length > 1 && (
            <path d={pointsToPath(currentPath)} fill="none" stroke={toolSettings.color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
          )}

          {/* Preview: shape */}
          {activeTool === 'shape' && drawStart && drawEnd && (
            (() => {
              const x = Math.min(drawStart.x, drawEnd.x);
              const y = Math.min(drawStart.y, drawEnd.y);
              const w = Math.abs(drawEnd.x - drawStart.x);
              const h = Math.abs(drawEnd.y - drawStart.y);
              if (toolSettings.shapeType === 'rectangle') {
                return <rect x={x} y={y} width={w} height={h} fill="none" stroke={toolSettings.color} strokeWidth={strokeW} opacity={0.5} strokeDasharray="4" />;
              }
              if (toolSettings.shapeType === 'ellipse') {
                return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={toolSettings.color} strokeWidth={strokeW} opacity={0.5} strokeDasharray="4" />;
              }
              return <path d={shapePath(toolSettings.shapeType, x, y, w, h)} fill="none" stroke={toolSettings.color} strokeWidth={strokeW} opacity={0.5} strokeDasharray="4" />;
            })()
          )}

          {/* Preview: line/arrow */}
          {(activeTool === 'line' || activeTool === 'arrow') && drawStart && drawEnd && (
            <line x1={drawStart.x} y1={drawStart.y} x2={drawEnd.x} y2={drawEnd.y} stroke={toolSettings.color} strokeWidth={strokeW} opacity={0.5} strokeDasharray="4" />
          )}
        </g>
      </svg>

      {/* Text input overlay */}
      {textPos && isActive && (
        <input
          ref={inputRef}
          className="fixed z-20 bg-transparent border-b border-foreground text-foreground font-mono outline-none"
          style={{
            left: textPos.x * zoom + pan.x + (leftOffsetPercent / 100) * window.innerWidth,
            top: textPos.y * zoom + pan.y - fontSize / 2,
            fontSize: fontSize * zoom,
            fontFamily,
          }}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleTextSubmit(); if (e.key === 'Escape') { setTextPos(null); setTextValue(''); } }}
          onBlur={handleTextSubmit}
          placeholder="Type..."
        />
      )}
    </>
  );
}
