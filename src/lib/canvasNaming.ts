const DEFAULT_CANVAS_SLUG = 'untitled';
const DEFAULT_PAGE_SLUG = 'page-1.cnvs';

function sanitizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCanvasSlug(value: string) {
  const sanitized = sanitizeSlug(value);
  return sanitized || DEFAULT_CANVAS_SLUG;
}

function normalizePageSlug(value: string) {
  const sanitized = sanitizeSlug(value.replace(/\.cnvs$/i, ''));
  const withPrefix = sanitized.startsWith('page-') ? sanitized : `page-${sanitized || '1'}`;
  return `${withPrefix}.cnvs`;
}

function toTitleWords(value: string) {
  return value.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export interface ParsedCanvasRouteName {
  canvasSlug: string;
  pageSlug: string;
  fullName: string;
  canvasLabel: string;
  pageLabel: string;
}

export function formatCanvasLabel(canvasSlug: string) {
  const normalized = normalizeCanvasSlug(canvasSlug).replace(/\.cnvs$/i, '');
  const timeFormatted = normalized.replace(/-(\d{2})-(\d{2})$/, ' $1:$2');
  const withSpaces = timeFormatted.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return toTitleWords(withSpaces) || 'Untitled';
}

export function formatPageLabel(pageSlug: string) {
  const normalized = normalizePageSlug(pageSlug).replace(/\.cnvs$/i, '');
  const withSpaces = normalized.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return toTitleWords(withSpaces) || 'Page 1';
}

export function toCanvasRouteName(canvasSlug: string, pageSlug: string) {
  const nextCanvas = normalizeCanvasSlug(canvasSlug);
  const nextPage = normalizePageSlug(pageSlug);
  return `${nextCanvas}/${nextPage}`;
}

export function parseCanvasRouteName(rawName?: string | null): ParsedCanvasRouteName {
  const raw = (rawName || '').trim();
  let canvasPart = DEFAULT_CANVAS_SLUG;
  let pagePart = DEFAULT_PAGE_SLUG;

  if (raw) {
    if (raw.includes('/')) {
      const [first, second] = raw.split('/');
      canvasPart = first || DEFAULT_CANVAS_SLUG;
      pagePart = second || DEFAULT_PAGE_SLUG;
    } else {
      canvasPart = raw;
      pagePart = DEFAULT_PAGE_SLUG;
    }
  }

  const canvasSlug = normalizeCanvasSlug(canvasPart);
  const pageSlug = normalizePageSlug(pagePart);

  return {
    canvasSlug,
    pageSlug,
    fullName: `${canvasSlug}/${pageSlug}`,
    canvasLabel: formatCanvasLabel(canvasSlug),
    pageLabel: formatPageLabel(pageSlug),
  };
}

export function createDefaultCanvasRouteName(date = new Date()) {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const day = days[date.getDay()];
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day}-${hh}-${mm}/${DEFAULT_PAGE_SLUG}`;
}

export function getPageNumber(pageSlug: string) {
  const normalized = normalizePageSlug(pageSlug);
  const match = normalized.match(/^page-(\d+)\.cnvs$/i);
  if (!match) return null;
  return Number(match[1]);
}

export function nextPageSlug(pageSlugs: string[]) {
  let maxPage = 0;
  for (const slug of pageSlugs) {
    const num = getPageNumber(slug);
    if (num && num > maxPage) maxPage = num;
  }
  return `page-${maxPage + 1}.cnvs`;
}
