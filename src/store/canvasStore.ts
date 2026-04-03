import { create } from 'zustand';

export type BlockType = 'note' | 'link' | 'todo' | 'image';

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

interface CanvasState {
  blocks: CanvasBlock[];
  pan: { x: number; y: number };
  zoom: number;
  selectedBlockId: string | null;
  addBlock: (type: BlockType, x?: number, y?: number) => void;
  updateBlock: (id: string, updates: Partial<CanvasBlock>) => void;
  deleteBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
  loadCanvas: (blocks: CanvasBlock[], pan: { x: number; y: number }, zoom: number) => void;
}

const defaultSizes: Record<BlockType, { width: number; height: number }> = {
  note: { width: 240, height: 160 },
  link: { width: 260, height: 200 },
  todo: { width: 240, height: 200 },
  image: { width: 280, height: 200 },
};

let idCounter = 0;
const genId = () => `block-${Date.now()}-${idCounter++}`;

export const useCanvasStore = create<CanvasState>((set) => ({
  blocks: [],
  pan: { x: 0, y: 0 },
  zoom: 1,
  selectedBlockId: null,

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
      url: type === 'link' ? 'https://' : type === 'image' ? '' : undefined,
      todos: type === 'todo' ? [{ id: genId(), text: '', done: false }] : undefined,
    };
    set((s) => ({ blocks: [...s.blocks, block], selectedBlockId: block.id }));
  },

  updateBlock: (id, updates) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),

  deleteBlock: (id) =>
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
    })),

  selectBlock: (id) => set({ selectedBlockId: id }),

  setPan: (pan) => set({ pan }),

  setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.1, zoom)) }),

  loadCanvas: (blocks, pan, zoom) => set({ blocks, pan, zoom, selectedBlockId: null }),
}));
