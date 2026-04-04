import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useCanvasStore, type CanvasBlock, genId } from '@/store/canvasStore';
import { CanvasBlockComponent } from './CanvasBlock';
import { DrawingLayer } from './DrawingLayer';
import { toast } from 'sonner';
import { getNoteSize } from '@/lib/blockSizing';

const CANVAS_BLOCK_CLIPBOARD_KEY = 'cnvs_block_clipboard_v1';

interface CopiedBlockPayload {
  type: 'cnvs-blocks';
  blocks: CanvasBlock[];
}

interface LegacyCopiedBlockPayload {
  type: 'cnvs-block';
  block: CanvasBlock;
}

interface Props {
  readOnly?: boolean;
  leftOffsetPercent?: number;
  loading?: boolean;
}

const DRAWING_TOOLS = ['pencil', 'eraser', 'text', 'shape', 'line', 'arrow'];
const MEDIA_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'gif', 'apng', 'bmp', 'ico', 'heic', 'heif', 'heiv', 'tif', 'tiff', 'jfif'];
const MEDIA_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm3u8', 'm4v', 'avi', 'wmv', 'flv', 'mkv', '3gp', 'ts', 'mts', 'm2ts', 'gifv'];
const MEDIA_AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'oga', 'ogg', 'opus', 'aiff', 'alac', 'amr', 'wma', 'weba', 'mpga', 'mid', 'midi'];

function extensionFromUrl(rawUrl: string) {
  const cleaned = rawUrl.split('#')[0].split('?')[0];
  const dot = cleaned.lastIndexOf('.');
  if (dot < 0) return '';
  return cleaned.slice(dot + 1).toLowerCase();
}

function toUrlCandidate(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^(blob:|data:|file:)/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\/|$|\?)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

function isUrlLike(input: string) {
  const candidate = toUrlCandidate(input);
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    return Boolean(parsed.hostname || parsed.protocol === 'blob:' || parsed.protocol === 'data:' || parsed.protocol === 'file:');
  } catch {
    return false;
  }
}

function isMediaUrl(input: string) {
  const candidate = toUrlCandidate(input);
  if (!candidate) return false;
  if (/^(blob:|data:|file:)/i.test(candidate)) return true;

  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    const isYouTubeVideo =
      (host.includes('youtube.com') && (
        (path === '/watch' && Boolean(parsed.searchParams.get('v')))
        || path.startsWith('/shorts/')
        || path.startsWith('/live/')
        || path.startsWith('/embed/')
      ))
      || (host.includes('youtu.be') && path.split('/').filter(Boolean).length > 0);

    const isInstagramMedia =
      host.includes('instagram.com')
      && (path.includes('/reel/') || path.includes('/p/') || path.includes('/tv/'));

    const isVimeoMedia =
      host.includes('vimeo.com')
      && (/\/\d{6,}/.test(path) || path.startsWith('/video/'));

    const isXTwitterStatus =
      (host.includes('x.com') || host.includes('twitter.com'))
      && /\/status\/\d+/.test(path);

    if (isYouTubeVideo || isInstagramMedia || isVimeoMedia || isXTwitterStatus) {
      return true;
    }
  } catch {
    // Fall back to extension/keyword checks below.
  }

  const ext = extensionFromUrl(candidate);
  if (MEDIA_IMAGE_EXTENSIONS.includes(ext) || MEDIA_VIDEO_EXTENSIONS.includes(ext) || MEDIA_AUDIO_EXTENSIONS.includes(ext)) {
    return true;
  }

  return /(^|[/?=&_-])(image|img|photo|video|stream|movie|clip|audio|podcast|music|sound|voice)([/?=&_-]|$)/i.test(candidate);
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (el.isContentEditable) return true;
  if (el.closest('[contenteditable="true"], input, textarea')) return true;
  return false;
}

export function InfiniteCanvas({ readOnly, leftOffsetPercent = 0, loading = false }: Props) {
  const blocks = useCanvasStore((s) => s.blocks);
  const pan = useCanvasStore((s) => s.pan);
  const zoom = useCanvasStore((s) => s.zoom);
  const setPan = useCanvasStore((s) => s.setPan);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const selectBlocks = useCanvasStore((s) => s.selectBlocks);
  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const isTouchPanning = useRef(false);
  const isTouchPinching = useRef(false);
  const touchPanOrigin = useRef({ x: 0, y: 0 });
  const touchPanThresholdPassed = useRef(false);
  const embedZoomResetTimer = useRef<number | null>(null);
  const pinchRef = useRef({
    worldX: 0,
    worldY: 0,
    startZoom: 1,
    startDistance: 0,
  });
  const lastMouse = useRef({ x: 0, y: 0 });
  const lastTouch = useRef({ x: 0, y: 0 });
  const isHandTool = activeTool === 'hand';
  const isDrawing = DRAWING_TOOLS.includes(activeTool);
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; canvasX: number; canvasY: number; blockId: string | null }>({
    open: false,
    x: 0,
    y: 0,
    canvasX: 0,
    canvasY: 0,
    blockId: null,
  });

  const setEmbedZoomThrough = (active: boolean) => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('cnvs-zoom-through-embeds', active);
  };

  const scheduleEmbedZoomThroughOff = (delay = 160) => {
    if (embedZoomResetTimer.current !== null) {
      window.clearTimeout(embedZoomResetTimer.current);
    }
    embedZoomResetTimer.current = window.setTimeout(() => {
      setEmbedZoomThrough(false);
      embedZoomResetTimer.current = null;
    }, delay);
  };

  const isScrollableElement = (el: Element) => {
    const node = el as HTMLElement;
    const style = window.getComputedStyle(node);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    return canScrollY || canScrollX;
  };

  const hasScrollableAncestor = (startTarget: EventTarget | null) => {
    const root = containerRef.current;
    let node = startTarget instanceof Element ? startTarget : null;
    while (node && root && node !== root) {
      if (isScrollableElement(node)) return true;
      node = node.parentElement;
    }
    return false;
  };

  const canNativeScrollFromTarget = (startTarget: EventTarget | null, deltaX: number, deltaY: number) => {
    const root = containerRef.current;
    let node = startTarget instanceof Element ? (startTarget as HTMLElement) : null;
    while (node && root && node !== root) {
      const style = window.getComputedStyle(node);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
      const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;

      if (canScrollY) {
        const canDown = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
        const canUp = node.scrollTop > 0;
        if ((deltaY > 0 && canDown) || (deltaY < 0 && canUp)) return true;
      }

      if (canScrollX) {
        const canRight = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
        const canLeft = node.scrollLeft > 0;
        if ((deltaX > 0 && canRight) || (deltaX < 0 && canLeft)) return true;
      }

      node = node.parentElement;
    }
    return false;
  };

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const canPinchZoom = e.ctrlKey || e.metaKey;
      if (canPinchZoom) {
        e.preventDefault();
        const state = useCanvasStore.getState();
        const delta = -e.deltaY * 0.002;
        state.setZoom(state.zoom * (1 + delta));
        return;
      }

      if (canNativeScrollFromTarget(e.target, e.deltaX, e.deltaY)) {
        return;
      }

      e.preventDefault();
      const state = useCanvasStore.getState();
      state.setPan({ x: state.pan.x - e.deltaX, y: state.pan.y - e.deltaY });
    },
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handleWheel, true);
  }, [handleWheel]);

  useEffect(() => {
    return () => {
      if (embedZoomResetTimer.current !== null) {
        window.clearTimeout(embedZoomResetTimer.current);
      }
      setEmbedZoomThrough(false);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (loading) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-context-menu="true"]')) {
      return;
    }
    // Keep current selection for context-menu workflows.
    if (e.button !== 0) {
      return;
    }
    if (menu.open) setMenu((m) => ({ ...m, open: false }));
    if (isDrawing) return;

    if (isHandTool) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      selectBlock(null);
      return;
    }

    if (e.target === containerRef.current || (e.target as HTMLElement).dataset.canvas) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      selectBlock(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (loading) return;
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    const state = useCanvasStore.getState();
    state.setPan({ x: state.pan.x + dx, y: state.pan.y + dy });
  };

  const handleMouseUp = () => {
    isPanning.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (loading) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    const left = bounds?.left || 0;
    const top = bounds?.top || 0;

    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const distance = Math.hypot(dx, dy);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const state = useCanvasStore.getState();

      isTouchPanning.current = false;
      isTouchPinching.current = true;
      setEmbedZoomThrough(true);
      pinchRef.current = {
        startDistance: Math.max(1, distance),
        startZoom: state.zoom,
        worldX: (midX - left - state.pan.x) / state.zoom,
        worldY: (midY - top - state.pan.y) / state.zoom,
      };
      e.preventDefault();
      return;
    }

    if (isDrawing) return;

    if (e.touches.length !== 1) return;

    if (isHandTool) {
      isTouchPinching.current = false;
      isTouchPanning.current = true;
      touchPanThresholdPassed.current = false;
      touchPanOrigin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      selectBlock(null);
      return;
    }

    const target = e.target as HTMLElement;
    if (target.closest('[data-block-id]')) {
      return;
    }
    if (target.closest('input, textarea, button, video, iframe, [contenteditable="true"]')) {
      return;
    }
    if (hasScrollableAncestor(target)) {
      return;
    }

    if (menu.open) setMenu((m) => ({ ...m, open: false }));
    isTouchPinching.current = false;
    isTouchPanning.current = true;
    touchPanThresholdPassed.current = false;
    touchPanOrigin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isTouchPinching.current) {
      e.preventDefault();
      setEmbedZoomThrough(true);
      const bounds = containerRef.current?.getBoundingClientRect();
      const left = bounds?.left || 0;
      const top = bounds?.top || 0;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const nextZoom = pinchRef.current.startZoom * (distance / pinchRef.current.startDistance);
      const clampedZoom = Math.min(8, Math.max(0.05, nextZoom));
      const nextPan = {
        x: midX - left - pinchRef.current.worldX * clampedZoom,
        y: midY - top - pinchRef.current.worldY * clampedZoom,
      };

      const state = useCanvasStore.getState();
      state.setZoom(clampedZoom);
      state.setPan(nextPan);
      return;
    }

    if (!isTouchPanning.current || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!touchPanThresholdPassed.current) {
      const distance = Math.hypot(t.clientX - touchPanOrigin.current.x, t.clientY - touchPanOrigin.current.y);
      if (distance < 6) {
        return;
      }
      touchPanThresholdPassed.current = true;
    }
    e.preventDefault();
    const dx = t.clientX - lastTouch.current.x;
    const dy = t.clientY - lastTouch.current.y;
    lastTouch.current = { x: t.clientX, y: t.clientY };
    const state = useCanvasStore.getState();
    state.setPan({ x: state.pan.x + dx, y: state.pan.y + dy });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      scheduleEmbedZoomThroughOff();
    }

    if (e.touches.length === 1) {
      isTouchPinching.current = false;
      isTouchPanning.current = true;
      touchPanThresholdPassed.current = false;
      touchPanOrigin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return;
    }

    if (e.touches.length === 0) {
      isTouchPanning.current = false;
      isTouchPinching.current = false;
      touchPanThresholdPassed.current = false;
    }
  };

  const dotOffset = {
    backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
  };

  const onCanvasContextMenu = async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || loading) return;

    const target = e.target as HTMLElement;
    const blockEl = target.closest('[data-block-id]') as HTMLElement | null;
    const blockId = blockEl?.dataset.blockId || null;
    const state = useCanvasStore.getState();
    const bounds = containerRef.current?.getBoundingClientRect();
    const left = bounds?.left || 0;
    const top = bounds?.top || 0;
    const canvasX = (e.clientX - left - state.pan.x) / state.zoom;
    const canvasY = (e.clientY - top - state.pan.y) / state.zoom;

    setMenu({ open: true, x: e.clientX, y: e.clientY, canvasX, canvasY, blockId });
  };

  const getViewportCenterCanvasPoint = () => {
    const bounds = containerRef.current?.getBoundingClientRect();
    const left = bounds?.left || 0;
    const top = bounds?.top || 0;
    const width = bounds?.width || window.innerWidth;
    const height = bounds?.height || window.innerHeight;
    const state = useCanvasStore.getState();
    return {
      x: (left + width / 2 - left - state.pan.x) / state.zoom,
      y: (top + height / 2 - top - state.pan.y) / state.zoom,
    };
  };

  const getPasteTargetPoint = () => {
    if (menu.open) {
      return { x: menu.canvasX, y: menu.canvasY };
    }
    return getViewportCenterCanvasPoint();
  };

  const getEditableElement = (blockId: string) => {
    const blockRoot = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
    if (!blockRoot) return null;
    const editable = blockRoot.querySelector('textarea, input, [contenteditable="true"]') as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLElement
      | null;
    return editable;
  };

  const selectEditableText = (target: HTMLInputElement | HTMLTextAreaElement | HTMLElement | null) => {
    if (!target) return false;
    target.focus();
    if ('select' in target && typeof target.select === 'function') {
      target.select();
      return true;
    }
    if (target.getAttribute('contenteditable') === 'true') {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    return false;
  };

  const readCopiedCanvasBlocks = (): CopiedBlockPayload | null => {
    try {
      const raw = localStorage.getItem(CANVAS_BLOCK_CLIPBOARD_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CopiedBlockPayload | LegacyCopiedBlockPayload;
      if (parsed?.type === 'cnvs-blocks' && Array.isArray((parsed as CopiedBlockPayload).blocks)) {
        const blocks = (parsed as CopiedBlockPayload).blocks.filter((block) => block?.id);
        if (!blocks.length) return null;
        return { type: 'cnvs-blocks', blocks };
      }
      if (parsed?.type === 'cnvs-block' && (parsed as LegacyCopiedBlockPayload).block?.id) {
        return { type: 'cnvs-blocks', blocks: [(parsed as LegacyCopiedBlockPayload).block] };
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const insertCopiedBlocks = (payload: CopiedBlockPayload, targetPoint: { x: number; y: number }) => {
    const sourceBlocks = payload.blocks || [];
    if (!sourceBlocks.length) return;

    const minX = Math.min(...sourceBlocks.map((block) => block.x));
    const minY = Math.min(...sourceBlocks.map((block) => block.y));
    const offsetX = targetPoint.x - minX;
    const offsetY = targetPoint.y - minY;

    const clonedBlocks = sourceBlocks.map((source) => {
      const clonedId = genId();
      const clonedTodos = source.todos?.map((todo) => ({ ...todo, id: genId() }));
      return {
        ...source,
        id: clonedId,
        x: source.x + offsetX,
        y: source.y + offsetY,
        todos: clonedTodos,
      } as CanvasBlock;
    });

    useCanvasStore.setState((state) => ({
      blocks: [...state.blocks, ...clonedBlocks],
      selectedBlockId: clonedBlocks[0]?.id || null,
      selectedBlockIds: clonedBlocks.map((block) => block.id),
      activeTool: 'select',
    }));
  };

  const handlePaste = useCallback(async (clipboardData?: DataTransfer | null) => {
    const targetPoint = getPasteTargetPoint();
    const createSimpleBlock = (type: 'note' | 'link' | 'media', payload: { content?: string; url?: string }) => {
      addBlock(type, targetPoint.x, targetPoint.y);
      const createdId = useCanvasStore.getState().selectedBlockId;
      if (!createdId) return;

      if (type === 'note') {
        const content = payload.content || '';
        const size = getNoteSize(content);
        updateBlock(createdId, {
          content,
          width: size.width,
          height: size.height,
        });
        return;
      }

      if (payload.url) {
        updateBlock(createdId, { url: payload.url });
      }
    };

    const plainFromClipboard = String(clipboardData?.getData('text/plain') || '').trim();
    const uriListFromClipboard = String(clipboardData?.getData('text/uri-list') || '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#')) || '';

    const maybeSerialized = plainFromClipboard.startsWith('{') ? plainFromClipboard : '';
    if (maybeSerialized) {
      try {
        const parsed = JSON.parse(maybeSerialized) as CopiedBlockPayload | LegacyCopiedBlockPayload;
        if (parsed?.type === 'cnvs-blocks' && Array.isArray((parsed as CopiedBlockPayload).blocks)) {
          const nextPayload: CopiedBlockPayload = {
            type: 'cnvs-blocks',
            blocks: (parsed as CopiedBlockPayload).blocks.filter((block) => block?.id),
          };
          if (nextPayload.blocks.length) {
            localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, JSON.stringify(nextPayload));
            insertCopiedBlocks(nextPayload, targetPoint);
            toast.success('Canvas component pasted');
            return;
          }
        }
        if (parsed?.type === 'cnvs-block' && (parsed as LegacyCopiedBlockPayload).block?.id) {
          const nextPayload: CopiedBlockPayload = { type: 'cnvs-blocks', blocks: [(parsed as LegacyCopiedBlockPayload).block] };
          localStorage.setItem(CANVAS_BLOCK_CLIPBOARD_KEY, JSON.stringify(nextPayload));
          insertCopiedBlocks(nextPayload, targetPoint);
          toast.success('Canvas component pasted');
          return;
        }
      } catch {
        // Continue classification for non-JSON text.
      }
    }

    const items = clipboardData?.items ? Array.from(clipboardData.items) : [];
    const mediaFileItem = items.find((item) => item.kind === 'file' && /^(image|video|audio)\//i.test(item.type));
    if (mediaFileItem) {
      const file = mediaFileItem.getAsFile();
      if (file) {
        createSimpleBlock('media', { url: URL.createObjectURL(file) });
        toast.success('Media pasted');
        return;
      }
    }

    let text = uriListFromClipboard || plainFromClipboard;
    if (!text) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        const copiedBlocks = readCopiedCanvasBlocks();
        if (copiedBlocks) {
          insertCopiedBlocks(copiedBlocks, targetPoint);
          toast.success('Canvas component pasted');
          return;
        }
        toast.error('Clipboard access blocked');
        return;
      }
    }

    if (!text) {
      const copiedBlocks = readCopiedCanvasBlocks();
      if (copiedBlocks) {
        insertCopiedBlocks(copiedBlocks, targetPoint);
        toast.success('Canvas component pasted');
        return;
      }
      toast.info('Clipboard is empty');
      return;
    }

    const normalizedText = text.trim();
    const urlCandidate = toUrlCandidate(normalizedText);
    const treatAsUrl = Boolean(urlCandidate && isUrlLike(normalizedText));

    if (treatAsUrl && urlCandidate) {
      if (isMediaUrl(urlCandidate)) {
        createSimpleBlock('media', { url: urlCandidate });
        toast.success('Media block created from link');
      } else {
        createSimpleBlock('link', { url: urlCandidate });
        toast.success('Link block created from link');
      }
      return;
    }

    createSimpleBlock('note', { content: text });
    toast.success('Note block created from text');
  }, [addBlock, getPasteTargetPoint, insertCopiedBlocks, readCopiedCanvasBlocks]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (readOnly || loading) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      void handlePaste(event.clipboardData);
    };

    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [handlePaste, loading, readOnly]);

  const handleSelect = () => {
    if (menu.blockId) {
      setActiveTool('select');
      selectBlocks([menu.blockId]);
      toast.success('Canvas component selected');
      return;
    }

    if (selectedBlockIds.length) {
      toast.success('Canvas component selected');
      return;
    }

    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.select();
      toast.success('Selected');
      return;
    }

    toast.info('Nothing selectable here');
  };

  const handleSelectAll = () => {
    const ids = useCanvasStore.getState().blocks.map((block) => block.id);
    if (!ids.length) {
      toast.info('Nothing selectable in canvas');
      return;
    }
    setActiveTool('select');
    selectBlocks(ids);
    toast.success('All canvas components selected');
  };

  const handleResetCanvas = () => {
    clearCanvas();
    toast.success('Canvas cleared');
  };

  const closeMenu = () => setMenu((m) => ({ ...m, open: false }));

  return (
    <div
      ref={containerRef}
      data-canvas="true"
      className={`fixed inset-0 canvas-dots overflow-hidden select-none ${isDrawing ? 'cursor-crosshair' : isHandTool ? 'cursor-grab' : 'cursor-default'}`}
      style={{
        ...dotOffset,
        left: `${leftOffsetPercent}%`,
        // Keep canvas gestures responsive while still allowing tap interactions inside embeds on mobile.
        touchAction: 'manipulation',
        overscrollBehavior: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={onCanvasContextMenu}
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border/80 border-t-foreground" />
        </div>
      ) : (
        <>
          <div
            data-canvas="true"
            data-canvas-content="true"
            className={`absolute inset-0 origin-top-left ${isHandTool ? 'pointer-events-none' : ''}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            {blocks.map((block) => (
              <CanvasBlockComponent key={block.id} block={block} readOnly={readOnly} />
            ))}
          </div>

          <DrawingLayer readOnly={readOnly} />
        </>
      )}

      {menu.open && !readOnly && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div
            data-context-menu="true"
            data-no-translate="true"
            className="fixed z-[100] w-40 border border-border bg-card p-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent"
              onClick={async () => {
                await handlePaste();
                closeMenu();
              }}
            >
              Paste
            </button>
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleSelect(); closeMenu(); }}>
              Select
            </button>
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleSelectAll(); closeMenu(); }}>
              Select All
            </button>
            <div className="my-1 h-px bg-border" />
            <button className="w-full px-2 py-1.5 text-left text-xs font-mono hover:bg-accent" onClick={() => { handleResetCanvas(); closeMenu(); }}>
              Reset Canvas
            </button>
          </div>
        </>
      )}
    </div>
  );
}
