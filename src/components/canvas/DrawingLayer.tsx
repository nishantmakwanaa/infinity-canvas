import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useCanvasStore, DrawingElement, SIZE_MAP, FONT_MAP, genId } from '@/store/canvasStore';

const DRAWING_TOOLS = ['pencil', 'eraser', 'text', 'shape', 'line', 'arrow'];
const MIN_FREEHAND_POINT_DISTANCE = 0.7;
const MIN_SHAPE_DISTANCE = 3;
const ERASER_HIT_STROKE = 16;
const TOUCH_FALLBACK_POINTER_ID = -1;

function distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function isPointNearElement(element: DrawingElement, x: number, y: number, radius: number) {
  if (element.type === 'freehand') {
    const pts = element.points || [];
    for (let i = 1; i < pts.length; i += 1) {
      if (distancePointToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= radius) return true;
    }
    return pts.length ? Math.hypot(x - pts[0].x, y - pts[0].y) <= radius : false;
  }

  if (element.type === 'line' || element.type === 'arrow') {
    return distancePointToSegment(x, y, element.x1, element.y1, element.x2, element.y2) <= radius;
  }

  if (element.type === 'text') {
    const estWidth = Math.max(20, element.content.length * element.fontSize * 0.62);
    const top = element.y - element.fontSize;
    return x >= element.x - radius && x <= element.x + estWidth + radius && y >= top - radius && y <= element.y + radius;
  }

  const sx = element.x;
  const sy = element.y;
  const ex = element.x + Math.abs(element.w);
  const ey = element.y + Math.abs(element.h);
  return x >= sx - radius && x <= ex + radius && y >= sy - radius && y <= ey + radius;
}

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  // Smooth freehand strokes with quadratic segments to reduce jitter.
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const curr = pts[i];
    const next = pts[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    path += ` Q ${curr.x} ${curr.y}, ${midX} ${midY}`;
  }
  const prev = pts[pts.length - 2];
  const last = pts[pts.length - 1];
  path += ` Q ${prev.x} ${prev.y}, ${last.x} ${last.y}`;
  return path;
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
  const eraseProps = onDelete
    ? {
        onPointerDown: (event: React.PointerEvent<SVGElement>) => {
          event.stopPropagation();
          onDelete(element.id);
        },
      }
    : {};

  const common = onDelete
    ? {
        onPointerDown: (event: React.PointerEvent<SVGElement>) => {
          event.stopPropagation();
          onDelete(element.id);
        },
      }
    : {};

  switch (element.type) {
    case 'freehand': {
      const d = pointsToPath(element.points);
      return (
        <g style={onDelete ? { cursor: 'pointer' } : {}}>
          <path d={d} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...common} />
          {onDelete && <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(ERASER_HIT_STROKE, element.strokeWidth + 10)} strokeLinecap="round" strokeLinejoin="round" {...eraseProps} />}
        </g>
      );
    }
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
      return (
        <g style={onDelete ? { cursor: 'pointer' } : {}}>
          <path d={shapePath(element.type, element.x, element.y, Math.abs(element.w), Math.abs(element.h))} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} {...common} />
          {onDelete && <path d={shapePath(element.type, element.x, element.y, Math.abs(element.w), Math.abs(element.h))} fill="none" stroke="transparent" strokeWidth={Math.max(ERASER_HIT_STROKE, element.strokeWidth + 10)} {...eraseProps} />}
        </g>
      );
    case 'text':
      return (
        <g {...common} style={onDelete ? { cursor: 'pointer' } : {}}>
          {element.highlight && (
            <rect
              x={element.x - 2}
              y={element.y - element.fontSize}
              width={Math.max(24, element.content.length * element.fontSize * 0.62)}
              height={element.fontSize * 1.25}
              fill="rgba(250, 204, 21, 0.28)"
            />
          )}
          <text
            x={element.x}
            y={element.y}
            fill={element.color}
            fontSize={element.fontSize}
            fontFamily={element.fontFamily}
            fontWeight={element.bold ? 700 : 400}
            fontStyle={element.italic ? 'italic' : 'normal'}
            textDecoration={element.underline ? 'underline' : 'none'}
          >
            {element.content}
          </text>
        </g>
      );
    case 'line':
      return (
        <g style={onDelete ? { cursor: 'pointer' } : {}}>
          <line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" {...common} />
          {onDelete && <line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke="transparent" strokeWidth={Math.max(ERASER_HIT_STROKE, element.strokeWidth + 10)} strokeLinecap="round" {...eraseProps} />}
        </g>
      );
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
          {onDelete && <line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke="transparent" strokeWidth={Math.max(ERASER_HIT_STROKE, element.strokeWidth + 10)} strokeLinecap="round" {...eraseProps} />}
        </g>
      );
    }
  }
}

export function DrawingLayer({ readOnly }: { readOnly?: boolean }) {
  const { drawingElements, activeTool, toolSettings, pan, zoom, addDrawingElement } = useCanvasStore();
  const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const isDrawing = useRef(false);
  const pathRef = useRef<{ x: number; y: number }[]>([]);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawEndRef = useRef<{ x: number; y: number } | null>(null);
  const drawToolRef = useRef<string | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const endPreviewRafRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<SVGSVGElement>(null);

  const isActive = DRAWING_TOOLS.includes(activeTool) && !readOnly;

  const toCanvasFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = layerRef.current?.getBoundingClientRect();
    const left = rect?.left || 0;
    const top = rect?.top || 0;
    return {
      x: (clientX - left - pan.x) / zoom,
      y: (clientY - top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const strokeW = SIZE_MAP[toolSettings.size].stroke;
  const fontSize = SIZE_MAP[toolSettings.size].text;
  const fontFamily = FONT_MAP[toolSettings.fontFamily];

  const schedulePreviewUpdate = useCallback(() => {
    if (previewRafRef.current !== null) return;
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null;
      setCurrentPath([...pathRef.current]);
    });
  }, []);

  const scheduleEndPreviewUpdate = useCallback(() => {
    if (endPreviewRafRef.current !== null) return;
    endPreviewRafRef.current = requestAnimationFrame(() => {
      endPreviewRafRef.current = null;
      setDrawEnd(drawEndRef.current);
    });
  }, []);

  const eraseAtPoint = useCallback((x: number, y: number) => {
    const state = useCanvasStore.getState();
    const elements = state.drawingElements;
    const radius = Math.max(ERASER_HIT_STROKE / 2, strokeW * 1.5) / Math.max(0.2, zoom);
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      if (isPointNearElement(elements[i], x, y, radius)) {
        state.deleteDrawingElement(elements[i].id);
        break;
      }
    }
  }, [strokeW, zoom]);

  useEffect(() => {
    return () => {
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current);
      }
      if (endPreviewRafRef.current !== null) {
        cancelAnimationFrame(endPreviewRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Reset transient drawing buffers when switching tools to avoid stale states.
    isDrawing.current = false;
    drawToolRef.current = null;
    activePointerIdRef.current = null;
    pathRef.current = [];
    drawStartRef.current = null;
    drawEndRef.current = null;
    setCurrentPath([]);
    setDrawStart(null);
    setDrawEnd(null);
  }, [activeTool, readOnly]);

  const finalizeDrawing = useCallback((finalPos?: { x: number; y: number }) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (finalPos) {
      if (drawToolRef.current === 'pencil') {
        const lastPoint = pathRef.current[pathRef.current.length - 1];
        const minDistance = MIN_FREEHAND_POINT_DISTANCE / Math.max(0.2, zoom);
        if (!lastPoint || Math.hypot(finalPos.x - lastPoint.x, finalPos.y - lastPoint.y) >= minDistance) {
          pathRef.current.push(finalPos);
        }
      }
      if (drawToolRef.current === 'shape' || drawToolRef.current === 'line' || drawToolRef.current === 'arrow') {
        drawEndRef.current = finalPos;
      }
    }

    const path = pathRef.current;
    const start = drawStartRef.current;
    const end = drawEndRef.current;
    const drawTool = drawToolRef.current;

    if (drawTool === 'pencil' && path.length > 0) {
      const normalizedPath = path.length === 1
        ? [path[0], { x: path[0].x + 0.01, y: path[0].y + 0.01 }]
        : path;
      addDrawingElement({ id: genId(), type: 'freehand', points: normalizedPath, color: toolSettings.color, strokeWidth: strokeW });
      pathRef.current = [];
      setCurrentPath([]);
    } else if (drawTool === 'eraser') {
      // Continuous erasing already handled in pointer/touch move.
    } else if (drawTool === 'shape' && start && end) {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (w > MIN_SHAPE_DISTANCE || h > MIN_SHAPE_DISTANCE) {
        addDrawingElement({ id: genId(), type: toolSettings.shapeType, x, y, w, h, color: toolSettings.color, strokeWidth: strokeW });
      }
      drawStartRef.current = null;
      drawEndRef.current = null;
      setDrawStart(null);
      setDrawEnd(null);
    } else if ((drawTool === 'line' || drawTool === 'arrow') && start && end) {
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      if (dist > MIN_SHAPE_DISTANCE) {
        addDrawingElement({ id: genId(), type: drawTool, x1: start.x, y1: start.y, x2: end.x, y2: end.y, color: toolSettings.color, strokeWidth: strokeW });
      }
      drawStartRef.current = null;
      drawEndRef.current = null;
      setDrawStart(null);
      setDrawEnd(null);
    }

    drawToolRef.current = null;
  }, [addDrawingElement, strokeW, toolSettings.color, toolSettings.shapeType, zoom]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isActive) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pos = toCanvasFromClient(e.clientX, e.clientY);
    const capturesPointer = activeTool === 'pencil' || activeTool === 'shape' || activeTool === 'line' || activeTool === 'arrow' || activeTool === 'eraser';
    if (capturesPointer) {
      activePointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture may fail on unsupported environments.
      }
    }

    if (activeTool === 'pencil') {
      drawToolRef.current = activeTool;
      isDrawing.current = true;
      pathRef.current = [pos];
      setCurrentPath([pos]);
    } else if (activeTool === 'eraser') {
      drawToolRef.current = activeTool;
      isDrawing.current = true;
      eraseAtPoint(pos.x, pos.y);
    } else if (activeTool === 'text') {
      setTextPos(pos);
      setTextValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (activeTool === 'shape' || activeTool === 'line' || activeTool === 'arrow') {
      drawToolRef.current = activeTool;
      isDrawing.current = true;
      drawStartRef.current = pos;
      drawEndRef.current = pos;
      setDrawStart(pos);
      setDrawEnd(pos);
    }
    e.stopPropagation();
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isActive || !isDrawing.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    const pos = toCanvasFromClient(e.clientX, e.clientY);
    if (drawToolRef.current === 'pencil') {
      const nativeEvent = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      const coalesced = typeof nativeEvent.getCoalescedEvents === 'function' ? nativeEvent.getCoalescedEvents() : [];
      const sourcePoints = coalesced.length
        ? coalesced.map((evt) => toCanvasFromClient(evt.clientX, evt.clientY))
        : [pos];

      const minDistance = MIN_FREEHAND_POINT_DISTANCE / Math.max(0.2, zoom);
      for (const point of sourcePoints) {
        const lastPoint = pathRef.current[pathRef.current.length - 1];
        if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= minDistance) {
          pathRef.current.push(point);
        }
      }
      schedulePreviewUpdate();
    } else if (drawToolRef.current === 'eraser') {
      eraseAtPoint(pos.x, pos.y);
    } else if (drawToolRef.current === 'shape' || drawToolRef.current === 'line' || drawToolRef.current === 'arrow') {
      drawEndRef.current = pos;
      scheduleEndPreviewUpdate();
    }
    e.stopPropagation();
    e.preventDefault();
  };

  const handlePointerUp = (e?: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing.current) return;
    if (activePointerIdRef.current !== null && e && e.pointerId !== activePointerIdRef.current) return;
    if (activePointerIdRef.current !== null && e) {
      try {
        e.currentTarget.releasePointerCapture(activePointerIdRef.current);
      } catch {
        // Ignore if capture already released.
      }
    }
    activePointerIdRef.current = null;

    const finalPos = e ? toCanvasFromClient(e.clientX, e.clientY) : undefined;
    finalizeDrawing(finalPos);

    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const handleTouchStartFallback = (e: React.TouchEvent<SVGSVGElement>) => {
    if (supportsPointerEvents) return;
    if (!isActive || e.touches.length !== 1) return;

    const t = e.touches[0];
    const pos = toCanvasFromClient(t.clientX, t.clientY);
    activePointerIdRef.current = TOUCH_FALLBACK_POINTER_ID;

    if (activeTool === 'pencil') {
      drawToolRef.current = activeTool;
      isDrawing.current = true;
      pathRef.current = [pos];
      setCurrentPath([pos]);
    } else if (activeTool === 'eraser') {
      drawToolRef.current = activeTool;
      isDrawing.current = true;
      eraseAtPoint(pos.x, pos.y);
    } else if (activeTool === 'text') {
      setTextPos(pos);
      setTextValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (activeTool === 'shape' || activeTool === 'line' || activeTool === 'arrow') {
      drawToolRef.current = activeTool;
      isDrawing.current = true;
      drawStartRef.current = pos;
      drawEndRef.current = pos;
      setDrawStart(pos);
      setDrawEnd(pos);
    }

    e.stopPropagation();
    e.preventDefault();
  };

  const handleTouchMoveFallback = (e: React.TouchEvent<SVGSVGElement>) => {
    if (supportsPointerEvents) return;
    if (!isActive || !isDrawing.current || activePointerIdRef.current !== TOUCH_FALLBACK_POINTER_ID) return;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    const pos = toCanvasFromClient(t.clientX, t.clientY);

    if (drawToolRef.current === 'pencil') {
      const lastPoint = pathRef.current[pathRef.current.length - 1];
      const minDistance = MIN_FREEHAND_POINT_DISTANCE / Math.max(0.2, zoom);
      if (!lastPoint || Math.hypot(pos.x - lastPoint.x, pos.y - lastPoint.y) >= minDistance) {
        pathRef.current.push(pos);
      }
      schedulePreviewUpdate();
    } else if (drawToolRef.current === 'eraser') {
      eraseAtPoint(pos.x, pos.y);
    } else if (drawToolRef.current === 'shape' || drawToolRef.current === 'line' || drawToolRef.current === 'arrow') {
      drawEndRef.current = pos;
      scheduleEndPreviewUpdate();
    }

    e.stopPropagation();
    e.preventDefault();
  };

  const handleTouchEndFallback = (e: React.TouchEvent<SVGSVGElement>) => {
    if (supportsPointerEvents) return;
    if (activePointerIdRef.current !== TOUCH_FALLBACK_POINTER_ID) return;

    const t = e.changedTouches[0];
    const finalPos = t ? toCanvasFromClient(t.clientX, t.clientY) : undefined;
    finalizeDrawing(finalPos);
    activePointerIdRef.current = null;

    e.stopPropagation();
    e.preventDefault();
  };

  const handleTextSubmit = () => {
    if (textPos && textValue.trim()) {
      addDrawingElement({
        id: genId(),
        type: 'text',
        x: textPos.x,
        y: textPos.y,
        content: textValue.trim(),
        color: toolSettings.color,
        fontSize,
        fontFamily,
        bold: toolSettings.textBold,
        italic: toolSettings.textItalic,
        underline: toolSettings.textUnderline,
        highlight: toolSettings.textHighlight,
      });
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
        className={`absolute inset-0 ${isActive ? 'z-10' : 'z-[5] pointer-events-none'}`}
        style={{ width: '100%', height: '100%', cursor: isActive ? getCursor() : 'default', touchAction: isActive ? 'none' : 'auto' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        onTouchStart={handleTouchStartFallback}
        onTouchMove={handleTouchMoveFallback}
        onTouchEnd={handleTouchEndFallback}
        onTouchCancel={handleTouchEndFallback}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {drawingElements.map((el) => (
            <DrawingElementRenderer
              key={el.id}
              element={el}
              onDelete={undefined}
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
            left: textPos.x * zoom + pan.x + (layerRef.current?.getBoundingClientRect().left || 0),
            top: textPos.y * zoom + pan.y + (layerRef.current?.getBoundingClientRect().top || 0) - fontSize / 2,
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
