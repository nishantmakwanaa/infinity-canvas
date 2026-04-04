import { parseCanvasRouteName } from '@/lib/canvasNaming';

const OWNER_TOKEN_PREFIX = 'pg';
const SHARE_TOKEN_PREFIX = 'sh';
const SHARE_EDIT_TOKEN_PREFIX = 'se';

function toBase64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string) {
  const normalized = input.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    return null;
  }

  try {
    const base64 = normalized
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function encodeSegment(input: string) {
  return toBase64Url(input);
}

function decodeSegment(input: string) {
  return fromBase64Url(input);
}

function stripPageSuffix(value: string) {
  return value.replace(/\.cnvs$/i, '').replace(/\.page$/i, '');
}

function buildOwnerIdentity(ownerUsername: string, _ownerUserId?: string | null) {
  const username = ownerUsername.trim().toLowerCase();
  return username;
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
  const compactShareToken = shareToken.trim().toLowerCase();
  const splitAt = Math.max(1, Math.floor(compactShareToken.length / 2));
  const left = compactShareToken.slice(0, splitAt);
  const right = compactShareToken.slice(splitAt);
  const userToken = `${SHARE_TOKEN_PREFIX}${encodeSegment(buildOwnerIdentity(ownerUsername, ownerUserId))}`;
  const canvasToken = left;
  const pageSegment = `${right}.page`;
  return `/${userToken}?${canvasToken}=${pageSegment}`;
}

export function toEditSharePagePath(ownerUsername: string, shareToken: string, ownerUserId?: string | null) {
  const compactShareToken = shareToken.trim().toLowerCase();
  const splitAt = Math.max(1, Math.floor(compactShareToken.length / 2));
  const left = compactShareToken.slice(0, splitAt);
  const right = compactShareToken.slice(splitAt);
  const userToken = `${SHARE_EDIT_TOKEN_PREFIX}${encodeSegment(buildOwnerIdentity(ownerUsername, ownerUserId))}`;
  const canvasToken = left;
  const pageSegment = `${right}.page`;
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
      : userToken.startsWith(SHARE_EDIT_TOKEN_PREFIX)
        ? 'share-edit'
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
  if (!decodedOwner) {
    return null;
  }

  if (kind === 'share' || kind === 'share-edit') {
    const isRawShareToken = /^[0-9a-f]+$/i.test(canvasToken) && /^[0-9a-f]+$/i.test(pageToken);
    if (isRawShareToken) {
      return {
        kind,
        userToken,
        canvasToken,
        pageToken,
        decodedOwner,
        decodedCanvas: canvasToken,
        decodedPage: pageToken,
      };
    }

    const decodedCanvas = decodeSegment(canvasToken);
    const decodedPage = decodeSegment(pageToken);
    if (!decodedCanvas || !decodedPage) {
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

  const decodedCanvas = decodeSegment(canvasToken);
  const decodedPage = decodeSegment(pageToken);
  if (!decodedCanvas || !decodedPage) return null;

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
