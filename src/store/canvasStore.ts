import { create } from 'zustand';

export type BlockType = 'note' | 'link' | 'todo' | 'media';
export type DrawingTool = 'pencil' | 'eraser' | 'text' | 'shape' | 'line' | 'arrow';
export type ActiveTool = 'select' | BlockType | DrawingTool;

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CanvasBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  url?: string;
  todos?: TodoItem[];
}

export type DrawingElement =
  | { id: string; type: 'freehand'; points: { x: number; y: number }[]; color: string; strokeWidth: number }
  | { id: string; type: 'rectangle' | 'ellipse' | 'triangle' | 'hexagon' | 'oval' | 'diamond' | 'star' | 'cloud' | 'heart'; x: number; y: number; w: number; h: number; color: string; strokeWidth: number }
  | { id: string; type: 'text'; x: number; y: number; content: string; color: string; fontSize: number; fontFamily: string }
  | { id: string; type: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number };

export type SizeOption = 'S' | 'M' | 'L' | 'XL';
export type FontOption = 'default' | 'sans' | 'serif' | 'mono';
export type ShapeOption = 'rectangle' | 'ellipse' | 'triangle' | 'hexagon' | 'oval' | 'diamond' | 'star' | 'cloud' | 'heart';

export interface ToolSettings {
  color: string;
  size: SizeOption;
  fontFamily: FontOption;
  shapeType: ShapeOption;
}

export const COLORS = [
  '#000000', '#9ca3af', '#c4b5fd', '#8b5cf6',
  '#3b82f6', '#93c5fd', '#eab308', '#f97316',
  '#ef4444', '#22c55e', '#fca5a5', '#86efac',
];

export const SIZE_MAP: Record<SizeOption, { stroke: number; text: number }> = {
  S: { stroke: 2, text: 14 },
  M: { stroke: 4, text: 20 },
  L: { stroke: 6, text: 28 },
  XL: { stroke: 8, text: 36 },
};

export const FONT_MAP: Record<FontOption, string> = {
  default: 'Space Grotesk, sans-serif',
  sans: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, Times New Roman, serif',
  mono: 'JetBrains Mono, monospace',
};

interface CanvasState {
  blocks: CanvasBlock[];
  drawingElements: DrawingElement[];
  pan: { x: number; y: number };
  zoom: number;
  selectedBlockId: string | null;
  activeTool: ActiveTool;
  toolSettings: ToolSettings;

  addBlock: (type: BlockType, x?: number, y?: number) => void;
  updateBlock: (id: string, updates: Partial<CanvasBlock>) => void;
  deleteBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setToolSettings: (settings: Partial<ToolSettings>) => void;
  addDrawingElement: (el: DrawingElement) => void;
  deleteDrawingElement: (id: string) => void;
  clearDrawings: () => void;
  loadCanvas: (blocks: CanvasBlock[], pan: { x: number; y: number }, zoom: number, drawings?: DrawingElement[]) => void;
}

const defaultSizes: Record<BlockType, { width: number; height: number }> = {
  note: { width: 240, height: 160 },
  link: { width: 260, height: 200 },
  todo: { width: 240, height: 200 },
  media: { width: 280, height: 200 },
};

let idCounter = 0;
export const genId = () => `el-${Date.now()}-${idCounter++}`;

export const useCanvasStore = create<CanvasState>((set) => ({
  blocks: [],
  drawingElements: [],
  pan: { x: 0, y: 0 },
  zoom: 1,
  selectedBlockId: null,
  activeTool: 'select',
  toolSettings: {
    color: '#000000',
    size: 'M',
    fontFamily: 'default',
    shapeType: 'rectangle',
  },

  addBlock: (type, x, y) => {
    const size = defaultSizes[type];
    const block: CanvasBlock = {
      id: genId(),
      type,
      x: x ?? 200 + Math.random() * 200,
      y: y ?? 200 + Math.random() * 200,
      width: size.width,
      height: size.height,
      content: '',
      url: type === 'link' ? '' : type === 'media' ? '' : undefined,
      todos: type === 'todo' ? [{ id: genId(), text: '', done: false }] : undefined,
    };
    set((s) => ({ blocks: [...s.blocks, block], selectedBlockId: block.id, activeTool: 'select' }));
  },

  updateBlock: (id, updates) =>
    set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)) })),

  deleteBlock: (id) =>
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
    })),

  selectBlock: (id) => set({ selectedBlockId: id }),
  setPan: (pan) => set({ pan }),
  setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.1, zoom)) }),
  setActiveTool: (tool) => set({ activeTool: tool, selectedBlockId: null }),
  setToolSettings: (s) => set((st) => ({ toolSettings: { ...st.toolSettings, ...s } })),
  addDrawingElement: (el) => set((s) => ({ drawingElements: [...s.drawingElements, el] })),
  deleteDrawingElement: (id) => set((s) => ({ drawingElements: s.drawingElements.filter((e) => e.id !== id) })),
  clearDrawings: () => set({ drawingElements: [] }),

  loadCanvas: (blocks, pan, zoom, drawings) => {
    const migrated = blocks.map((b: any) =>
      b.type === 'image' ? { ...b, type: 'media' as BlockType } : b
    );
    set({ blocks: migrated, pan, zoom, drawingElements: drawings || [], selectedBlockId: null, activeTool: 'select' });
  },
}));
