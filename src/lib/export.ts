import html2canvas from 'html2canvas';

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

function downloadSvg(svgData: string) {
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.download = 'cnvs-export.svg';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
