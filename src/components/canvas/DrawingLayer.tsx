import React, { useRef, useState, useCallback } from 'react';
import { useCanvasStore, DrawingElement, SIZE_MAP, FONT_MAP, genId } from '@/store/canvasStore';

const DRAWING_TOOLS = ['pencil', 'eraser', 'text', 'shape', 'line', 'arrow'];

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
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

export function DrawingLayer({ readOnly }: { readOnly?: boolean }) {
  const { drawingElements, activeTool, toolSettings, pan, zoom, addDrawingElement, deleteDrawingElement } = useCanvasStore();
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const isDrawing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = DRAWING_TOOLS.includes(activeTool) && !readOnly;

  const toCanvas = useCallback((e: React.MouseEvent) => ({
    x: (e.clientX - pan.x) / zoom,
    y: (e.clientY - pan.y) / zoom,
  }), [pan, zoom]);

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
        data-drawing-layer="true"
        className={`fixed inset-0 ${isActive ? 'z-10' : 'z-[5] pointer-events-none'}`}
        style={{ width: '100%', height: '100%', cursor: isActive ? getCursor() : 'default' }}
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
            toolSettings.shapeType === 'rectangle'
              ? <rect x={Math.min(drawStart.x, drawEnd.x)} y={Math.min(drawStart.y, drawEnd.y)} width={Math.abs(drawEnd.x - drawStart.x)} height={Math.abs(drawEnd.y - drawStart.y)} fill="none" stroke={toolSettings.color} strokeWidth={strokeW} opacity={0.5} strokeDasharray="4" />
              : <ellipse cx={(drawStart.x + drawEnd.x) / 2} cy={(drawStart.y + drawEnd.y) / 2} rx={Math.abs(drawEnd.x - drawStart.x) / 2} ry={Math.abs(drawEnd.y - drawStart.y) / 2} fill="none" stroke={toolSettings.color} strokeWidth={strokeW} opacity={0.5} strokeDasharray="4" />
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
            left: textPos.x * zoom + pan.x,
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
