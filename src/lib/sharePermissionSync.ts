import { supabase } from '@/integrations/supabase/client';

export type ShareAccessLevel = 'viewer' | 'editor';

type SyncRpcMode = 'auto' | 'current' | 'legacy' | 'disabled';

const SYNC_RPC_MODE_KEY = 'cnvs_sync_share_rpc_mode_v1';

function readSyncRpcMode(): SyncRpcMode {
  try {
    const raw = String(localStorage.getItem(SYNC_RPC_MODE_KEY) || '').trim();
    if (raw === 'current' || raw === 'legacy' || raw === 'disabled' || raw === 'auto') {
      return raw;
    }
  } catch {
    // ignore storage access issues
  }
  return 'auto';
}

function writeSyncRpcMode(mode: SyncRpcMode) {
  try {
    localStorage.setItem(SYNC_RPC_MODE_KEY, mode);
  } catch {
    // ignore storage access issues
  }
}

let syncRpcMode: SyncRpcMode = readSyncRpcMode();

function setSyncRpcMode(mode: SyncRpcMode) {
  syncRpcMode = mode;
  writeSyncRpcMode(mode);
}

async function callSyncRpc(canvasId: string, accessLevel?: ShareAccessLevel) {
  try {
    const response = await supabase.rpc('sync_canvas_permission_from_share', {
      p_canvas_id: canvasId,
      p_access_level: accessLevel,
    });
    return { error: response?.error || null };
  } catch (error) {
    return { error };
  }
}

async function callLegacySyncRpc(canvasId: string) {
  try {
    const response = await supabase.rpc('sync_canvas_permission_from_share', {
      p_canvas_id: canvasId,
    });
    return { error: response?.error || null };
  } catch (error) {
    return { error };
  }
}

function isSignatureMismatchError(error: any) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  if (code === '42883' || code === 'PGRST202' || code === 'PGRST203') return true;
  if (status === 400 && message.includes('function')) return true;
  if (message.includes('could not find the function')) return true;
  if (message.includes('no function matches')) return true;
  return false;
}

/**
 * Best-effort sync of canvas_permissions from share settings.
 * Tries the newer `(uuid, text)` signature first, then falls back to `(uuid)`.
 */
export async function syncCanvasPermissionFromShare(
  canvasId: string,
  accessLevel?: ShareAccessLevel,
) {
  if (!canvasId) return false;

  if (syncRpcMode === 'disabled') {
    return false;
  }

  if (syncRpcMode === 'legacy') {
    const legacy = await callLegacySyncRpc(canvasId);
    if (!legacy?.error) {
      return true;
    }
    if (legacy?.error && Number(legacy.error?.status || 0) === 400) {
      setSyncRpcMode('disabled');
    }
    return false;
  }

  if (syncRpcMode === 'current') {
    const preferred = await callSyncRpc(canvasId, accessLevel);
    if (!preferred?.error) {
      return true;
    }
    const preferredStatus = Number(preferred?.error?.status || 0);
    if (preferred?.error && (isSignatureMismatchError(preferred.error) || preferredStatus === 400)) {
      setSyncRpcMode('legacy');
      const legacy = await callLegacySyncRpc(canvasId);
      if (!legacy?.error) {
        return true;
      }
      if (legacy?.error) {
        setSyncRpcMode(Number(legacy.error?.status || 0) === 400 ? 'disabled' : 'auto');
      }
    }
    return false;
  }

  const preferred = await callSyncRpc(canvasId, accessLevel);

  if (!preferred?.error) {
    setSyncRpcMode('current');
    return true;
  }
  const preferredStatus = Number(preferred.error?.status || 0);
  if (!isSignatureMismatchError(preferred.error) && preferredStatus !== 400) return false;

  setSyncRpcMode('legacy');

  const legacy = await callLegacySyncRpc(canvasId);
  if (!legacy?.error) {
    return true;
  }
  if (legacy?.error) {
    setSyncRpcMode(Number(legacy.error?.status || 0) === 400 ? 'disabled' : 'auto');
  }
  return false;
}
