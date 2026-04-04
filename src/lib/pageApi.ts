import { parseCanvasRouteName } from '@/lib/canvasNaming';

const OWNER_TOKEN_PREFIX = 'pg';
const SHARE_TOKEN_PREFIX = 'sh';

function toHex(input: string) {
  const encoded = new TextEncoder().encode(input);
  return Array.from(encoded)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(input: string) {
  if (!/^[0-9a-fA-F]+$/.test(input) || input.length % 2 !== 0) {
    return null;
  }

  try {
    const bytes = new Uint8Array(input.length / 2);
    for (let i = 0; i < input.length; i += 2) {
      bytes[i / 2] = Number.parseInt(input.slice(i, i + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function stylizeHex(input: string) {
  if (!input) return '';
  const chunks: string[] = [];
  for (let i = 0; i < input.length; i += 8) {
    chunks.push(input.slice(i, i + 8));
  }
  return chunks
    .map((chunk, index) => {
      if (index === 0) return chunk;
      return `${index % 2 === 1 ? '.' : '-'}${chunk}`;
    })
    .join('');
}

function deStylizeHex(input: string) {
  return input.replace(/[.-]/g, '');
}

function encodeSegment(input: string) {
  return stylizeHex(toHex(input));
}

function decodeSegment(input: string) {
  return fromHex(deStylizeHex(input));
}

function stripPageSuffix(value: string) {
  return value.replace(/\.cnvs$/i, '').replace(/\.page$/i, '');
}

function buildOwnerIdentity(ownerUsername: string, ownerUserId?: string | null) {
  const username = ownerUsername.trim().toLowerCase();
  const userId = (ownerUserId || '').trim().toLowerCase();
  return userId ? `${username}|${userId}` : username;
}

export function toOwnerPageToken(ownerUsername: string, ownerUserId?: string | null) {
  return `${OWNER_TOKEN_PREFIX}${encodeSegment(buildOwnerIdentity(ownerUsername, ownerUserId))}`;
}

export function toOwnerCanvasToken(rawCanvasName: string) {
  const parsed = parseCanvasRouteName(rawCanvasName);
  return encodeSegment(parsed.canvasSlug);
}

export function toOwnerPageSegment(rawCanvasName: string) {
  const parsed = parseCanvasRouteName(rawCanvasName);
  return `${encodeSegment(stripPageSuffix(parsed.pageSlug))}.page`;
}

export function toOwnerPagePath(ownerUsername: string, rawCanvasName: string, ownerUserId?: string | null) {
  const userToken = toOwnerPageToken(ownerUsername, ownerUserId);
  const canvasToken = toOwnerCanvasToken(rawCanvasName);
  const pageSegment = toOwnerPageSegment(rawCanvasName);
  return `/${userToken}?${canvasToken}=${pageSegment}`;
}

export function toSharePagePath(ownerUsername: string, shareToken: string, ownerUserId?: string | null) {
  const splitAt = Math.max(1, Math.floor(shareToken.length / 2));
  const left = shareToken.slice(0, splitAt);
  const right = shareToken.slice(splitAt);
  const userToken = `${SHARE_TOKEN_PREFIX}${encodeSegment(buildOwnerIdentity(ownerUsername, ownerUserId))}`;
  const canvasToken = encodeSegment(left);
  const pageSegment = `${encodeSegment(right)}.page`;
  return `/${userToken}?${canvasToken}=${pageSegment}`;
}

export function getPageApiOrigin() {
  const configured = import.meta.env.VITE_PAGE_API_ORIGIN?.trim();
  return configured && configured.length ? configured : window.location.origin;
}

export function toPageApiUrl(path: string) {
  return `${getPageApiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function parseSegmentedApiRequest(rawUserToken?: string | null, rawSearch?: string | null) {
  const userToken = (rawUserToken || '').trim();
  const search = (rawSearch || '').trim();
  if (!userToken || !search) return null;

  const kind = userToken.startsWith(OWNER_TOKEN_PREFIX)
    ? 'owner'
    : userToken.startsWith(SHARE_TOKEN_PREFIX)
      ? 'share'
      : null;
  if (!kind) return null;

  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const entries = Array.from(params.entries());
  if (entries.length !== 1) return null;

  const [canvasToken, rawPageSegment] = entries[0];
  const pageTokenWithSuffix = (rawPageSegment || '').trim();
  if (!canvasToken || !pageTokenWithSuffix.toLowerCase().endsWith('.page')) return null;

  const pageToken = pageTokenWithSuffix.slice(0, -'.page'.length);
  if (!pageToken) return null;

  const decodedOwner = decodeSegment(userToken.slice(2));
  const decodedCanvas = decodeSegment(canvasToken);
  const decodedPage = decodeSegment(pageToken);

  if (!decodedOwner || !decodedCanvas || !decodedPage) {
    return null;
  }

  return {
    kind,
    userToken,
    canvasToken,
    pageToken,
    decodedOwner,
    decodedCanvas,
    decodedPage,
  };
}
