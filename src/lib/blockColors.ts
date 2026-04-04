function normalizeHexColor(input: string) {
  const raw = String(input || '').trim();
  if (!raw.startsWith('#')) return null;

  if (raw.length === 4) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (raw.length === 7) {
    return raw.toLowerCase();
  }

  return null;
}

function toRgb(hexColor: string) {
  const hex = normalizeHexColor(hexColor);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function toLinear(value: number) {
  const normalized = value / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hexColor: string) {
  const rgb = toRgb(hexColor);
  if (!rgb) return null;
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getBlockForegroundColor(backgroundColor?: string) {
  if (!backgroundColor) return null;
  const value = luminance(backgroundColor);
  if (value == null) return null;
  return value < 0.45 ? '#ffffff' : '#111111';
}

export function getBlockMutedColor(backgroundColor?: string) {
  if (!backgroundColor) return null;
  const value = luminance(backgroundColor);
  if (value == null) return null;
  return value < 0.45 ? 'rgba(255,255,255,0.78)' : 'rgba(17,17,17,0.72)';
}
