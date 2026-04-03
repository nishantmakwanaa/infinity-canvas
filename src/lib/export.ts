import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { useCanvasStore, type CanvasBlock, type DrawingElement } from '@/store/canvasStore';

interface CnvsExportFile {
  format: 'cnvs';
  version: 1;
  exportedAt: string;
  data: {
    blocks: CanvasBlock[];
    drawings: DrawingElement[];
    pan: { x: number; y: number };
    zoom: number;
  };
}

export async function exportCanvasAsPng() {
  const el = document.querySelector('[data-canvas-content="true"]') as HTMLElement;
  if (!el) return;
  try {
    const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = 'cnvs-export.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    console.error('PNG export failed:', e);
  }
}

export function exportCanvasAsSvg() {
  const svgEl = document.querySelector('[data-drawing-layer="true"]');
  if (!svgEl) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><text x="100" y="100" font-family="monospace" font-size="14">No drawings to export</text></svg>';
    downloadSvg(svg);
    return;
  }
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const svgData = new XMLSerializer().serializeToString(clone);
  downloadSvg(svgData);
}

export function exportCanvasAsCnvs() {
  try {
    const state = useCanvasStore.getState();
    const payload: CnvsExportFile = {
      format: 'cnvs',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        blocks: JSON.parse(JSON.stringify(state.blocks || [])),
        drawings: JSON.parse(JSON.stringify(state.drawingElements || [])),
        pan: { x: state.pan?.x || 0, y: state.pan?.y || 0 },
        zoom: typeof state.zoom === 'number' ? state.zoom : 1,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `cnvs-${timestamp}.cnvs`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error('CNVS export failed:', error);
    toast.error('Failed to export .cnvs file');
  }
}

function isValidCnvsPayload(value: any): value is CnvsExportFile {
  if (!value || typeof value !== 'object') return false;
  if (value.format !== 'cnvs' || value.version !== 1) return false;
  if (!value.data || typeof value.data !== 'object') return false;
  if (!Array.isArray(value.data.blocks) || !Array.isArray(value.data.drawings)) return false;
  if (!value.data.pan || typeof value.data.pan.x !== 'number' || typeof value.data.pan.y !== 'number') return false;
  if (typeof value.data.zoom !== 'number') return false;
  return true;
}

export async function importCanvasFromCnvsFile(file: File) {
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);

    if (!isValidCnvsPayload(parsed)) {
      toast.error('Invalid .cnvs file');
      return null;
    }

    useCanvasStore
      .getState()
      .loadCanvas(parsed.data.blocks, parsed.data.pan, parsed.data.zoom, parsed.data.drawings);
    toast.success('Canvas loaded from .cnvs');
    return parsed;
  } catch (error) {
    console.error('CNVS import failed:', error);
    toast.error('Failed to load .cnvs file');
    return null;
  }
}

function downloadSvg(svgData: string) {
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.download = 'cnvs-export.svg';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
