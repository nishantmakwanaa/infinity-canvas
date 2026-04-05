const APP_TITLE = 'CNVS | Infinite Canvas Workspace for Teams';
const APP_DESCRIPTION = 'CNVS is an infinite canvas workspace for notes, drawings, media, and real-time collaboration. Organize visual thinking with multi-page canvases and share with viewer or editor access.';

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readSupabaseConfig() {
  const url = String(
    process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || ''
  ).trim();

  const anonKey = String(
    process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || ''
  ).trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

async function callRpc(rpcName: string, payload: Record<string, unknown>) {
  const config = readSupabaseConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeRpcRow(data: unknown) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

async function loadPreviewMeta(userToken: string, canvasToken: string, pageToken: string, mode: string) {
  const payload = {
    p_user_token: userToken,
    p_canvas_token: canvasToken,
    p_page_token: pageToken,
  };

  const previewMetaRaw = await callRpc('get_page_preview_metadata', payload);
  const previewMeta = normalizeRpcRow(previewMetaRaw);
  if (previewMeta) {
    const title = String(previewMeta.title || '').trim();
    const description = String(previewMeta.description || '').trim();
    if (title && description) {
      return { title, description };
    }
  }

  const routeRaw = await callRpc('open_page_api_link', payload);
  const route = normalizeRpcRow(routeRaw);
  if (route) {
    const canvasName = String(route.canvas_name || 'untitled').trim() || 'untitled';
    const pageName = String(route.page_name || 'page-1.cnvs').trim() || 'page-1.cnvs';
    const shareAccess = String(route.share_access || '').toLowerCase();
    const type = mode === 'editor' && shareAccess === 'editor' ? 'Editable' : 'View only';
    const title = `CNVS | ${canvasName} - ${pageName} | ${type}`;
    const description = `${APP_DESCRIPTION} Canvas: ${canvasName}. Page: ${pageName}. Access: ${type}.`;
    return { title, description };
  }

  return {
    title: mode === 'editor' ? 'CNVS | Shared Canvas | Editable' : 'CNVS | Shared Canvas | View only',
    description: APP_DESCRIPTION,
  };
}

function buildAbsoluteUrl(req: any, path: string) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return path;
  return `${proto}://${host}${path}`;
}

export default async function handler(req: any, res: any) {
  const userToken = String(req.query.u || '').trim();
  const canvasToken = String(req.query.c || '').trim();
  const pageToken = String(req.query.p || '').trim();
  const modeRaw = String(req.query.m || 'viewer').trim().toLowerCase();
  const mode = modeRaw === 'editor' ? 'editor' : 'viewer';

  if (!userToken || !canvasToken || !pageToken) {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send('<!doctype html><html><head><title>CNVS</title></head><body>Invalid share link.</body></html>');
    return;
  }

  const canonicalPath = `/${encodeURIComponent(userToken)}?${encodeURIComponent(canvasToken)}=${encodeURIComponent(pageToken)}.page`;
  const canonicalUrl = buildAbsoluteUrl(req, canonicalPath);

  let previewTitle = APP_TITLE;
  let previewDescription = APP_DESCRIPTION;

  try {
    const preview = await loadPreviewMeta(userToken, canvasToken, pageToken, mode);
    previewTitle = preview.title;
    previewDescription = preview.description;
  } catch {
    // Keep default metadata fallback.
  }

  const escapedTitle = escapeHtml(previewTitle);
  const escapedDescription = escapeHtml(previewDescription);
  const escapedCanonicalUrl = escapeHtml(canonicalUrl);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapedCanonicalUrl}" />
    <meta property="og:site_name" content="CNVS" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <link rel="canonical" href="${escapedCanonicalUrl}" />
    <meta http-equiv="refresh" content="0;url=${escapedCanonicalUrl}" />
    <script>
      window.location.replace(${JSON.stringify(canonicalUrl)});
    </script>
  </head>
  <body></body>
</html>`;

  res.status(200);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
