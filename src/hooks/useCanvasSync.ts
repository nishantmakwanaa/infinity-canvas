import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, CanvasBlock, DrawingElement } from '@/store/canvasStore';
import type { Session } from '@supabase/supabase-js';
import { createDefaultCanvasRouteName, nextPageSlug, parseCanvasRouteName, toCanvasRouteName } from '@/lib/canvasNaming';
import { recordPerfMetric } from '@/lib/perfTelemetry';
import { syncCanvasPermissionFromShare } from '@/lib/sharePermissionSync';
import { toast } from 'sonner';

export interface CanvasMeta {
  id: string;
  name: string;
  updated_at: string;
}

interface UseCanvasSyncOptions {
  enabled?: boolean;
}

export type CanvasAccessLevel = 'viewer' | 'editor';
type JoinedCanvasAccessMap = Record<string, CanvasAccessLevel>;

const GUEST_CANVAS_STORAGE_KEY = 'cnvs_guest_canvas_v1';
const LAST_OPENED_CANVAS_KEY_PREFIX = 'cnvs_last_opened_canvas_v1_';
const PENDING_CANVAS_SYNC_KEY_PREFIX = 'cnvs_pending_canvas_sync_v1_';
const JOINED_CANVAS_ACCESS_KEY_PREFIX = 'cnvs_joined_canvas_access_v1_';

interface LocalCanvasSnapshot {
  blocks: CanvasBlock[];
  drawings: DrawingElement[];
  pan: { x: number; y: number };
  zoom: number;
}

interface PendingCanvasSyncSnapshot extends LocalCanvasSnapshot {
  canvasId: string;
  userId: string;
  updatedAt: string;
  queuedAtMs?: number;
  signature?: string;
}

function isLegacyUsernameCanvasName(name: string | null | undefined) {
  if (!name) return false;
  return /'s Canvas$/i.test(name.trim());
}

function isBlankSnapshot(snapshot: LocalCanvasSnapshot | null) {
  if (!snapshot) return true;
  const noBlocks = (snapshot.blocks || []).length === 0;
  const noDrawings = (snapshot.drawings || []).length === 0;
  return noBlocks && noDrawings;
}

function readGuestSnapshot(): LocalCanvasSnapshot | null {
  try {
    const raw = localStorage.getItem(GUEST_CANVAS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalCanvasSnapshot;
    if (!parsed || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.drawings) || !parsed.pan || typeof parsed.zoom !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeGuestSnapshot(snapshot: LocalCanvasSnapshot) {
  try {
    localStorage.setItem(GUEST_CANVAS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota/storage access errors.
  }
}

function clearGuestSnapshot() {
  try {
    localStorage.removeItem(GUEST_CANVAS_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
}

function lastOpenedCanvasKey(userId: string) {
  return `${LAST_OPENED_CANVAS_KEY_PREFIX}${userId}`;
}

function readLastOpenedCanvasId(userId: string): string | null {
  try {
    return localStorage.getItem(lastOpenedCanvasKey(userId));
  } catch {
    return null;
  }
}

function writeLastOpenedCanvasId(userId: string, canvasId: string) {
  try {
    localStorage.setItem(lastOpenedCanvasKey(userId), canvasId);
  } catch {
    // Ignore storage access errors.
  }
}

function pendingCanvasSyncKey(userId: string, canvasId: string) {
  return `${PENDING_CANVAS_SYNC_KEY_PREFIX}${userId}_${canvasId}`;
}

function writePendingCanvasSync(snapshot: PendingCanvasSyncSnapshot) {
  try {
    localStorage.setItem(
      pendingCanvasSyncKey(snapshot.userId, snapshot.canvasId),
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore quota/storage access errors.
  }
}

function readPendingCanvasSync(key: string): PendingCanvasSyncSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCanvasSyncSnapshot;
    if (!parsed || !parsed.canvasId || !parsed.userId || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.drawings) || !parsed.pan || typeof parsed.zoom !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function removePendingCanvasSync(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors.
  }
}

function listPendingCanvasSyncKeysForUser(userId: string) {
  try {
    const prefix = `${PENDING_CANVAS_SYNC_KEY_PREFIX}${userId}_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function joinedCanvasAccessKey(userId: string) {
  return `${JOINED_CANVAS_ACCESS_KEY_PREFIX}${userId}`;
}

function readJoinedCanvasAccess(userId: string): JoinedCanvasAccessMap {
  try {
    const raw = localStorage.getItem(joinedCanvasAccessKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const next: JoinedCanvasAccessMap = {};
    Object.entries(parsed || {}).forEach(([canvasId, value]) => {
      if (!canvasId) return;
      next[canvasId] = value === 'editor' ? 'editor' : 'viewer';
    });
    return next;
  } catch {
    return {};
  }
}

function writeJoinedCanvasAccess(userId: string, map: JoinedCanvasAccessMap) {
  try {
    localStorage.setItem(joinedCanvasAccessKey(userId), JSON.stringify(map));
  } catch {
    // Ignore storage access errors.
  }
}

function isCanvasNameConflictError(error: any) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return status === 409 || code === '23505' || message.includes('canvases_user_id_name_key') || message.includes('duplicate key');
}

function withCanvasNameAttempt(baseName: string, attempt: number) {
  if (attempt <= 0) return baseName;
  const parsed = parseCanvasRouteName(baseName);
  return `${parsed.canvasSlug}-${attempt + 1}/${parsed.pageSlug}`;
}

function isPermissionDeniedError(error: any) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').trim();
  return status === 401 || status === 403 || code === '42501';
}

function isRpcMissingError(error: any) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42883' || message.includes('function') && message.includes('does not exist');
}

/** PostgREST: table/RPC not in API schema (migration not applied on this Supabase project). */
function isPostgrestResourceMissingError(error: any) {
  const status = Number(error?.status || 0);
  if (status !== 404) return false;
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  if (code === 'PGRST202' || code === 'PGRST205') return true;
  if (message.includes('schema cache')) return true;
  if (message.includes('could not find the table')) return true;
  if (message.includes('could not find the function')) return true;
  return true;
}

export function useCanvasSync(session: Session | null, options?: UseCanvasSyncOptions) {
  const enabled = options?.enabled ?? true;
  const canvasIdRef = useRef<string | null>(null);
  const currentCanvasIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const flushSoonTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const guestSaveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastGuestSignatureRef = useRef('');
  const lastQueuedSignatureByCanvasRef = useRef<Record<string, string>>({});
  const bootstrapCreatePromiseByUserRef = useRef<Record<string, Promise<CanvasMeta | null>>>({});
  const pendingSyncCacheRef = useRef<Record<string, PendingCanvasSyncSnapshot>>({});
  const blockedWriteCanvasIdsRef = useRef<Set<string>>(new Set());
  const sharedCanvasesRef = useRef<CanvasMeta[]>([]);
  const joinedCanvasAccessRef = useRef<JoinedCanvasAccessMap>({});
  const permissionWarningShownRef = useRef(false);
  const schemaMissingWarningShownRef = useRef(false);
  const isFlushingRemoteRef = useRef(false);
  const flushRetryRequestedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const autoLoadInFlightUserIdRef = useRef<string | null>(null);
  const lastAutoLoadAtByUserRef = useRef<Record<string, number>>({});
  const collectionsRefreshInFlightRef = useRef(false);
  const lastCollectionsRefreshAtRef = useRef(0);
  const accessRecoveryInFlightRef = useRef(false);
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [sharedCanvases, setSharedCanvases] = useState<CanvasMeta[]>([]);
  const [shareAccessByCanvasId, setShareAccessByCanvasId] = useState<Record<string, CanvasAccessLevel>>({});
  const [joinedCanvasAccessByCanvasId, setJoinedCanvasAccessByCanvasId] = useState<JoinedCanvasAccessMap>({});
  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
  const [currentCanvasName, setCurrentCanvasName] = useState<string | null>(null);
  const [isCanvasLoading, setIsCanvasLoading] = useState(true);

  useEffect(() => {
    sharedCanvasesRef.current = sharedCanvases;
  }, [sharedCanvases]);

  useEffect(() => {
    joinedCanvasAccessRef.current = joinedCanvasAccessByCanvasId;
  }, [joinedCanvasAccessByCanvasId]);

  const warnPermissionIssue = useCallback(() => {
    if (permissionWarningShownRef.current) return;
    permissionWarningShownRef.current = true;
    toast.error('Supabase permission error (403). Apply latest DB migrations and sign in again.');
  }, []);

  const warnSchemaNotDeployed = useCallback(() => {
    if (schemaMissingWarningShownRef.current) return;
    schemaMissingWarningShownRef.current = true;
    toast.error(
      'Supabase returned 404: tables/RPCs are missing on this project. Run supabase/migrations/20260404100000_cnvs_baseline.sql in the Dashboard SQL Editor, or run `supabase db push` after linking this project.',
      { duration: 12_000 }
    );
  }, []);

  const canWriteCanvas = useCallback((canvasId: string) => {
    if (!canvasId) return false;
    if (blockedWriteCanvasIdsRef.current.has(canvasId)) return false;
    if (canvases.some((canvas) => canvas.id === canvasId)) return true;
    if (shareAccessByCanvasId[canvasId] === 'editor') return true;
    if (joinedCanvasAccessByCanvasId[canvasId] === 'editor') return true;
    return false;
  }, [canvases, joinedCanvasAccessByCanvasId, shareAccessByCanvasId]);

  const insertCanvasWithRetry = useCallback(async (
    userId: string,
    baseName: string,
    payload?: Partial<{
      blocks: CanvasBlock[];
      drawings: DrawingElement[];
      pan_x: number;
      pan_y: number;
      zoom: number;
    }>,
    mutateNameOnConflict = true
  ) => {
    const rpc: any = await supabase.rpc('create_canvas_with_unique_name', {
      p_name: baseName,
      p_blocks: (payload?.blocks || []) as any,
      p_drawings: (payload?.drawings || []) as any,
      p_pan_x: payload?.pan_x ?? 0,
      p_pan_y: payload?.pan_y ?? 0,
      p_zoom: payload?.zoom ?? 1,
    });
    const rpcRow = Array.isArray(rpc?.data) ? rpc.data[0] : rpc?.data;
    if (rpcRow?.id) {
      return rpcRow as any;
    }

    if (isPermissionDeniedError(rpc?.error)) {
      warnPermissionIssue();
      return null;
    }
    if (isPostgrestResourceMissingError(rpc?.error)) {
      warnSchemaNotDeployed();
      return null;
    }

    const maxAttempts = mutateNameOnConflict ? 6 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateName = mutateNameOnConflict ? withCanvasNameAttempt(baseName, attempt) : baseName;
      const { data, error } = await supabase
        .from('canvases')
        .insert({
          user_id: userId,
          name: candidateName,
          blocks: payload?.blocks || [],
          drawings: payload?.drawings || [],
          pan_x: payload?.pan_x ?? 0,
          pan_y: payload?.pan_y ?? 0,
          zoom: payload?.zoom ?? 1,
        } as any)
        .select('id,name,updated_at')
        .single();

      if (data?.id) return data as any;
      if (!error) continue;
      const status = Number((error as any)?.status || 0);
      if (status === 401 || status === 403 || String((error as any)?.code || '') === '42501') {
        warnPermissionIssue();
      }
      if (isPostgrestResourceMissingError(error)) {
        warnSchemaNotDeployed();
        return null;
      }
      if (!mutateNameOnConflict || !isCanvasNameConflictError(error)) {
        return null;
      }
    }
    return null;
  }, [warnPermissionIssue, warnSchemaNotDeployed]);

  const refreshCanvases = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('canvases')
      .select('id,name,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const rows = data as CanvasMeta[];
      setCanvases(rows);
      return rows;
    }

    const rpc = await supabase.rpc('list_owned_canvases');
    if (!rpc?.error && Array.isArray(rpc?.data)) {
      const rows = (rpc.data || []) as CanvasMeta[];
      setCanvases(rows);
      return rows;
    }

    if (isPermissionDeniedError(rpc?.error)) {
      warnPermissionIssue();
    }
    if (isPostgrestResourceMissingError(rpc?.error)) {
      warnSchemaNotDeployed();
    }

    if (isPermissionDeniedError(error)) {
      warnPermissionIssue();
    }
    if (isPostgrestResourceMissingError(error)) {
      warnSchemaNotDeployed();
    }
    return null;
  }, [warnPermissionIssue, warnSchemaNotDeployed]);

  const refreshSharedCanvases = useCallback(async (userId: string) => {
    const localJoinedAccess = readJoinedCanvasAccess(userId);
    const localJoinedIds = Object.keys(localJoinedAccess).filter((id) => id.trim().length > 0);

    type JoinedRow = { id: string; name: string; updated_at: string; role: string };
    let rows: JoinedRow[] | null = null;
    let usedLocalFallbackOnly = false;

    const rpc = await supabase.rpc('list_joined_canvases');
    if (!rpc?.error && Array.isArray(rpc?.data)) {
      rows = (rpc.data || []) as JoinedRow[];
    } else {
      if (isPermissionDeniedError(rpc?.error)) {
        warnPermissionIssue();
      }
      if (isPostgrestResourceMissingError(rpc?.error)) {
        warnSchemaNotDeployed();
      }

      const { data: permRows, error: permErr } = await supabase
        .from('canvas_permissions')
        .select('canvas_id, role')
        .eq('user_id', userId)
        .in('role', ['viewer', 'editor']);

      if (!permErr && Array.isArray(permRows) && permRows.length) {
        const canvasIds = [
          ...new Set(
            permRows
              .map((r: { canvas_id?: string }) => String(r?.canvas_id || '').trim())
              .filter(Boolean)
          ),
        ];
        const { data: canvasRows, error: canvasErr } = await supabase
          .from('canvases')
          .select('id,name,updated_at,user_id')
          .in('id', canvasIds);

        if (!canvasErr && Array.isArray(canvasRows)) {
          const roleById = new Map<string, string>();
          permRows.forEach((r: { canvas_id?: string; role?: string }) => {
            const cid = String(r?.canvas_id || '').trim();
            if (!cid) return;
            const next = String(r?.role || '').toLowerCase();
            if (next === 'editor' || !roleById.has(cid)) {
              roleById.set(cid, next === 'editor' ? 'editor' : 'viewer');
            }
          });

          rows = canvasRows
            .filter((c) => c.user_id !== userId)
            .map((c) => ({
              id: c.id,
              name: c.name,
              updated_at: c.updated_at,
              role: roleById.get(c.id) || 'viewer',
            }));
        } else if (isPermissionDeniedError(canvasErr)) {
          warnPermissionIssue();
        } else if (isPostgrestResourceMissingError(canvasErr)) {
          warnSchemaNotDeployed();
        }
      } else if (isPermissionDeniedError(permErr)) {
        warnPermissionIssue();
      } else if (isPostgrestResourceMissingError(permErr)) {
        warnSchemaNotDeployed();
      }

      if (rows === null && localJoinedIds.length) {
        const { data: localCanvasRows, error: localCanvasErr } = await supabase
          .from('canvases')
          .select('id,name,updated_at,user_id')
          .in('id', localJoinedIds);

        if (!localCanvasErr && Array.isArray(localCanvasRows)) {
          usedLocalFallbackOnly = true;
          rows = localCanvasRows
            .filter((c) => c.user_id !== userId)
            .map((c) => ({
              id: c.id,
              name: c.name,
              updated_at: c.updated_at,
              role: localJoinedAccess[c.id] === 'editor' ? 'editor' : 'viewer',
            }));
        } else if (isPermissionDeniedError(localCanvasErr)) {
          warnPermissionIssue();
        } else if (isPostgrestResourceMissingError(localCanvasErr)) {
          warnSchemaNotDeployed();
        }
      }

      if (rows === null) {
        // Keep current joined list on transient failures; avoid wiping sidebar sections.
        return sharedCanvasesRef.current;
      }

      const existingJoinedIds = new Set(rows.map((row) => String(row?.id || '').trim()).filter(Boolean));
      const missingLocalJoinedIds = localJoinedIds.filter((id) => !existingJoinedIds.has(id));
      if (missingLocalJoinedIds.length) {
        const { data: missingLocalRows, error: missingLocalErr } = await supabase
          .from('canvases')
          .select('id,name,updated_at,user_id')
          .in('id', missingLocalJoinedIds);

        if (!missingLocalErr && Array.isArray(missingLocalRows) && missingLocalRows.length) {
          const additions: JoinedRow[] = missingLocalRows
            .filter((c) => c.user_id !== userId)
            .map((c) => ({
              id: c.id,
              name: c.name,
              updated_at: c.updated_at,
              role: localJoinedAccess[c.id] === 'editor' ? 'editor' : 'viewer',
            }));

          if (additions.length) {
            rows = [...rows, ...additions];
          }
        } else if (isPermissionDeniedError(missingLocalErr)) {
          warnPermissionIssue();
        } else if (isPostgrestResourceMissingError(missingLocalErr)) {
          warnSchemaNotDeployed();
        }
      }
    }

    const nextJoined: JoinedCanvasAccessMap = {};
    rows.forEach((row) => {
      const canvasId = String(row?.id || '').trim();
      if (!canvasId) return;
      const role = String(row?.role || '').toLowerCase() === 'editor' ? 'editor' : 'viewer';
      const localRole = localJoinedAccess[canvasId];
      // Keep strongest known access so edit links do not get downgraded by stale role payloads.
      nextJoined[canvasId] = (localRole === 'editor' || role === 'editor') ? 'editor' : 'viewer';
    });

    const mapped = rows.map((row) => ({
      id: row.id,
      name: row.name,
      updated_at: row.updated_at,
    })) as CanvasMeta[];

    const mappedById = new Map(mapped.map((canvas) => [canvas.id, canvas]));
    const missingMappedIds = localJoinedIds.filter((id) => !mappedById.has(id));
    missingMappedIds.forEach((id) => {
      const existing = sharedCanvasesRef.current.find((canvas) => canvas.id === id);
      mappedById.set(id, existing || {
        id,
        name: 'shared-canvas/page-1.cnvs',
        updated_at: new Date().toISOString(),
      });
      if (!nextJoined[id]) {
        nextJoined[id] = localJoinedAccess[id] === 'editor' ? 'editor' : 'viewer';
      }
    });

    const finalMapped = Array.from(mappedById.values())
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

    setJoinedCanvasAccessByCanvasId(nextJoined);
    writeJoinedCanvasAccess(userId, nextJoined);
    setSharedCanvases(finalMapped);
    return finalMapped;
  }, [warnPermissionIssue, warnSchemaNotDeployed]);

  const refreshShareAccessByCanvasIds = useCallback(async (canvasIds: string[]) => {
    if (!canvasIds.length) {
      setShareAccessByCanvasId({});
      return {} as Record<string, 'viewer' | 'editor'>;
    }

    const { data, error, status } = await supabase
      .from('shared_canvases')
      .select('canvas_id,access_level,created_at')
      .in('canvas_id', canvasIds);

    if (error) {
      if (status === 401 || status === 403) {
        warnPermissionIssue();
      }
      return {} as Record<string, 'viewer' | 'editor'>;
    }

    const latestByCanvas = new Map<string, { access: 'viewer' | 'editor'; createdAtMs: number }>();
    (data || []).forEach((row: any) => {
      const id = String(row?.canvas_id || '').trim();
      if (!id) return;
      const level: 'viewer' | 'editor' = String(row?.access_level || '').toLowerCase() === 'editor' ? 'editor' : 'viewer';
      const createdAtMs = Date.parse(String(row?.created_at || '')) || 0;
      const prev = latestByCanvas.get(id);
      if (!prev || createdAtMs >= prev.createdAtMs) {
        latestByCanvas.set(id, { access: level, createdAtMs });
      }
    });

    const next: Record<string, 'viewer' | 'editor'> = {};
    latestByCanvas.forEach((value, id) => {
      next[id] = value.access;
    });

    Object.entries(next).forEach(([canvasId, accessLevel]) => {
      if (accessLevel === 'editor') {
        blockedWriteCanvasIdsRef.current.delete(canvasId);
      }
    });

    setShareAccessByCanvasId(next);
    return next;
  }, [warnPermissionIssue]);

  const refreshAllCanvasCollections = useCallback(async (userId: string) => {
    const [owned, shared] = await Promise.all([
      refreshCanvases(userId),
      refreshSharedCanvases(userId),
    ]);

    const ids = [
      ...((owned || []).map((canvas) => canvas.id)),
      ...((shared || []).map((canvas) => canvas.id)),
    ];
    const shareAccess = await refreshShareAccessByCanvasIds(ids);
    return { owned, shared, shareAccess };
  }, [refreshCanvases, refreshShareAccessByCanvasIds, refreshSharedCanvases]);

  const ensureSingleBootstrapCanvas = useCallback(async (userId: string) => {
    if (!userId) return null;

    const bootstrapLockKey = `cnvs_bootstrap_canvas_lock_v1_${userId}`;
    const nowMs = Date.now();
    let lockHeldByAnother = false;
    try {
      const existingRaw = sessionStorage.getItem(bootstrapLockKey);
      const existingAtMs = existingRaw ? Number(existingRaw) : 0;
      if (Number.isFinite(existingAtMs) && existingAtMs > 0 && nowMs - existingAtMs < 12_000) {
        lockHeldByAnother = true;
      }
      if (!lockHeldByAnother) {
        sessionStorage.setItem(bootstrapLockKey, String(nowMs));
      }
    } catch {
      // Ignore storage access issues and continue with in-memory guard only.
    }

    if (lockHeldByAnother) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const existingOwned = await refreshCanvases(userId);
        if (Array.isArray(existingOwned) && existingOwned.length) {
          return existingOwned[0];
        }
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
      return null;
    }

    const inFlight = bootstrapCreatePromiseByUserRef.current[userId];
    if (inFlight) {
      return await inFlight;
    }

    const promise = (async () => {
      const existingOwned = await refreshCanvases(userId);
      if (Array.isArray(existingOwned) && existingOwned.length) {
        return existingOwned[0];
      }

      const defaultName = createDefaultCanvasRouteName();
      const created = await insertCanvasWithRetry(userId, defaultName, undefined, false);
      if (created?.id) {
        return created as CanvasMeta;
      }

      const sameNameLookup = await supabase
        .from('canvases')
        .select('id,name,updated_at')
        .eq('user_id', userId)
        .eq('name', defaultName)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sameNameLookup.data?.id) {
        return sameNameLookup.data as CanvasMeta;
      }

      const ownedAfterCreateAttempt = await refreshCanvases(userId);
      if (Array.isArray(ownedAfterCreateAttempt) && ownedAfterCreateAttempt.length) {
        return ownedAfterCreateAttempt[0];
      }

      const finalOwned = await refreshCanvases(userId);
      if (Array.isArray(finalOwned) && finalOwned.length) {
        return finalOwned[0];
      }

      return null;
    })();

    bootstrapCreatePromiseByUserRef.current[userId] = promise;
    let bootstrapResult: CanvasMeta | null = null;
    try {
      bootstrapResult = await promise;
      return bootstrapResult;
    } finally {
      delete bootstrapCreatePromiseByUserRef.current[userId];
      try {
        if (bootstrapResult?.id) {
          // Keep lock timestamp for a short window so duplicate startup effects cannot double-create.
          sessionStorage.setItem(bootstrapLockKey, String(Date.now()));
        } else {
          sessionStorage.removeItem(bootstrapLockKey);
        }
      } catch {
        // Ignore storage access errors.
      }
    }
  }, [insertCanvasWithRetry, refreshCanvases]);

  const refreshAllCanvasCollectionsThrottled = useCallback(async (
    userId: string,
    options?: { force?: boolean; minGapMs?: number }
  ) => {
    if (!userId) return;
    if (collectionsRefreshInFlightRef.current) return;

    const now = Date.now();
    const minGapMs = options?.minGapMs ?? 2500;
    if (!options?.force && now - lastCollectionsRefreshAtRef.current < minGapMs) {
      return;
    }

    collectionsRefreshInFlightRef.current = true;
    lastCollectionsRefreshAtRef.current = now;
    try {
      await refreshAllCanvasCollections(userId);
    } finally {
      collectionsRefreshInFlightRef.current = false;
    }
  }, [refreshAllCanvasCollections]);

  const ensureJoinedAccessPersisted = useCallback(async (
    userId: string,
    canvasId: string,
    access: CanvasAccessLevel,
  ) => {
    const hasRequiredPermission = async () => {
      const { data, error } = await supabase
        .from('canvas_permissions')
        .select('role')
        .eq('canvas_id', canvasId)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (error || !data) return false;
      const role = String((data as any).role || '').toLowerCase();
      if (access === 'editor') {
        return role === 'owner' || role === 'editor';
      }
      return role === 'owner' || role === 'editor' || role === 'viewer';
    };

    if (await hasRequiredPermission()) {
      return true;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await syncCanvasPermissionFromShare(canvasId, access);
      if (await hasRequiredPermission()) {
        return true;
      }
    }

    // Compatibility fallback for projects that allow direct permission upserts.
    const direct = await supabase
      .from('canvas_permissions')
      .upsert({
        canvas_id: canvasId,
        user_id: userId,
        role: access === 'editor' ? 'editor' : 'viewer',
        granted_by: null,
      } as any, { onConflict: 'canvas_id,user_id' });

    if (!direct.error && await hasRequiredPermission()) {
      return true;
    }

    return false;
  }, []);

  const markJoinedCanvasAccess = useCallback((
    canvasId: string,
    access: CanvasAccessLevel,
    options?: { canvasName?: string; updatedAt?: string }
  ) => {
    const userId = session?.user?.id;
    if (!userId || !canvasId) return;
    const requestedAccess: CanvasAccessLevel = access === 'editor' ? 'editor' : 'viewer';

    if (requestedAccess === 'editor') {
      blockedWriteCanvasIdsRef.current.delete(canvasId);
    }

    setJoinedCanvasAccessByCanvasId((prev) => {
      const nextAccess: CanvasAccessLevel = requestedAccess;
      const next = { ...prev, [canvasId]: nextAccess };
      writeJoinedCanvasAccess(userId, next);
      return next;
    });

    setSharedCanvases((prev) => {
      const fallbackName = String(options?.canvasName || '').trim() || 'untitled/page-1.cnvs';
      const fallbackUpdatedAt = String(options?.updatedAt || '').trim() || new Date().toISOString();
      const existingIndex = prev.findIndex((canvas) => canvas.id === canvasId);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const nextName = existing.name || fallbackName;
        const nextUpdatedAt = existing.updated_at || fallbackUpdatedAt;
        if (nextName === existing.name && nextUpdatedAt === existing.updated_at) {
          return prev;
        }
        const next = [...prev];
        next[existingIndex] = { ...existing, name: nextName, updated_at: nextUpdatedAt };
        return next;
      }
      return [{ id: canvasId, name: fallbackName, updated_at: fallbackUpdatedAt }, ...prev];
    });

    void ensureJoinedAccessPersisted(userId, canvasId, requestedAccess).then((persisted) => {
      if (persisted) {
        void refreshAllCanvasCollectionsThrottled(userId, { force: true, minGapMs: 0 });
      }
    });
  }, [ensureJoinedAccessPersisted, refreshAllCanvasCollectionsThrottled, session?.user?.id]);

  const removeJoinedCanvasAccess = useCallback((userId: string, canvasId: string) => {
    if (!userId || !canvasId) return;
    setJoinedCanvasAccessByCanvasId((prev) => {
      if (!prev[canvasId]) return prev;
      const next = { ...prev };
      delete next[canvasId];
      writeJoinedCanvasAccess(userId, next);
      return next;
    });
    setSharedCanvases((prev) => prev.filter((canvas) => canvas.id !== canvasId));
  }, []);

  const readServerLastOpenedCanvasId = useCallback(async () => {
    const rpc: any = await supabase.rpc('get_last_opened_canvas_id');
    if (rpc?.error) {
      if (isPermissionDeniedError(rpc.error)) {
        warnPermissionIssue();
      }
      if (isRpcMissingError(rpc.error)) {
        return null;
      }
      return null;
    }

    const row = Array.isArray(rpc?.data) ? rpc.data[0] : rpc?.data;
    const id = String(row?.canvas_id || '').trim();
    return id || null;
  }, [warnPermissionIssue]);

  const syncServerLastOpenedCanvasId = useCallback(async (canvasId: string) => {
    if (!canvasId) return;
    const rpc = await supabase.rpc('set_last_opened_canvas_id', {
      p_canvas_id: canvasId,
    });
    if (rpc?.error && isPermissionDeniedError(rpc.error)) {
      warnPermissionIssue();
    }
  }, [warnPermissionIssue]);

  const loadCanvasById = useCallback(async (
    canvasId: string,
    persistForUserId?: string,
    options?: { allowRedirectOnMissing?: boolean; showLoading?: boolean }
  ): Promise<boolean> => {
    const allowRedirectOnMissing = options?.allowRedirectOnMissing ?? true;
    const showLoading = options?.showLoading ?? true;
    const seq = ++loadSeqRef.current;
    isLoadingRef.current = true;
    if (showLoading) {
      setIsCanvasLoading(true);
    }

    try {
      const isKnownJoinedCanvas = Boolean(joinedCanvasAccessRef.current[canvasId])
        || sharedCanvasesRef.current.some((canvas) => canvas.id === canvasId);

      const rpc = await supabase.rpc('get_canvas_for_user', {
        p_canvas_id: canvasId,
      }) as any;

      let data: any[] | null = Array.isArray(rpc?.data)
        ? rpc.data
        : (rpc?.data ? [rpc.data] : []);
      let error: any = rpc?.error || null;
      let status = Number(error?.status || 0);

      if (error && (isRpcMissingError(error) || status === 400)) {
        const fallback = await supabase
          .from('canvases')
          .select('*')
          .eq('id', canvasId)
          .limit(1);
        data = Array.isArray(fallback.data) ? fallback.data : [];
        error = fallback.error;
        status = Number((fallback as any)?.status || Number(error?.status || 0));
      }

      // Joined/editor routes can still be valid even if permission-sync RPC lags.
      if ((!data || !data.length) && isKnownJoinedCanvas) {
        const fallback = await supabase
          .from('canvases')
          .select('*')
          .eq('id', canvasId)
          .limit(1);
        if (Array.isArray(fallback.data) && fallback.data.length) {
          data = fallback.data;
          error = null;
          status = 200;
        }
      }

      // Final fallback for sidebar switching: open by id if row exists.
      if (!data || !data.length) {
        const fallback = await supabase
          .from('canvases')
          .select('*')
          .eq('id', canvasId)
          .limit(1);
        if (Array.isArray(fallback.data) && fallback.data.length) {
          data = fallback.data;
          error = null;
          status = 200;
        } else if (!error && fallback.error) {
          error = fallback.error;
          status = Number((fallback as any)?.status || Number((fallback.error as any)?.status || 0));
        }
      }

      if (seq !== loadSeqRef.current) return false;

      if (error) {
        if (status === 401 || status === 403) {
          warnPermissionIssue();
        }
      }

      const row = Array.isArray(data) ? data[0] : null;

      if (!row) {
        const confirmedMissing = status === 404 || status === 406 || (!error && !isKnownJoinedCanvas);
        if (!confirmedMissing) {
          return false;
        }
        if (!allowRedirectOnMissing) {
          return false;
        }
        if (persistForUserId) {
          removeJoinedCanvasAccess(persistForUserId, canvasId);
        }
        if (persistForUserId) {
          const { owned } = await refreshAllCanvasCollections(persistForUserId);
          if (seq !== loadSeqRef.current) return false;
          const fallback = (owned || [])[0];
          if (fallback?.id && fallback.id !== canvasId) {
            return await loadCanvasById(fallback.id, persistForUserId, options);
          }
        }
        if (currentCanvasIdRef.current === canvasId) {
          currentCanvasIdRef.current = null;
          canvasIdRef.current = null;
          setCurrentCanvasId(null);
          setCurrentCanvasName(null);
        }
        return false;
      }

      canvasIdRef.current = row.id;
      currentCanvasIdRef.current = row.id;
      blockedWriteCanvasIdsRef.current.delete(row.id);
      setCurrentCanvasId(row.id);
      setCurrentCanvasName((row as any).name || null);
      if (persistForUserId) {
        writeLastOpenedCanvasId(persistForUserId, row.id);
        void syncServerLastOpenedCanvasId(row.id);
      }
      const store = useCanvasStore.getState();
      const drawings = (row as any).drawings as DrawingElement[] || [];
      store.loadCanvas(
        (row.blocks as unknown as CanvasBlock[]) || [],
        { x: row.pan_x, y: row.pan_y },
        1,
        drawings
      );
      return true;
    } catch (error: any) {
      if (isPermissionDeniedError(error)) {
        warnPermissionIssue();
      }
      if (isPostgrestResourceMissingError(error)) {
        warnSchemaNotDeployed();
      }
      return false;
    } finally {
      isLoadingRef.current = false;
      if (seq === loadSeqRef.current) {
        setIsCanvasLoading(false);
      }
    }
  }, [refreshAllCanvasCollections, removeJoinedCanvasAccess, syncServerLastOpenedCanvasId, warnPermissionIssue, warnSchemaNotDeployed]);

  const loadCanvas = useCallback(async (userId: string) => {
    const autoLoadSeq = ++loadSeqRef.current;
    const wasAutoLoadCancelled = () => loadSeqRef.current !== autoLoadSeq;

    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    const { owned: list, shared: joinedList, shareAccess } = await refreshAllCanvasCollections(userId);
    if (!list) {
      isLoadingRef.current = false;
      setIsCanvasLoading(false);
      return;
    }
    if (wasAutoLoadCancelled()) {
      isLoadingRef.current = false;
      return;
    }

    const joined = joinedList || [];
    const allAccessible = [...list, ...joined.filter((canvas) => !list.some((owned) => owned.id === canvas.id))];
    const accessibleById = new Map(allAccessible.map((canvas) => [canvas.id, canvas]));

    const firstOwnedPrivateFromAccess = list.find((canvas) => !shareAccess?.[canvas.id]);

    const ownedIds = list.map((canvas) => canvas.id);
    const sharedOwnedIdSet = new Set<string>();
    if (ownedIds.length) {
      const { data: shareRows, error: shareErr, status: shareStatus } = await supabase
        .from('shared_canvases')
        .select('canvas_id,access_level')
        .in('canvas_id', ownedIds);

      if (!shareErr && Array.isArray(shareRows)) {
        shareRows.forEach((row: any) => {
          const id = String(row?.canvas_id || '').trim();
          const level = String(row?.access_level || '').toLowerCase();
          if (id && (level === 'viewer' || level === 'editor')) {
            sharedOwnedIdSet.add(id);
          }
        });
      } else if (shareStatus === 401 || shareStatus === 403) {
        warnPermissionIssue();
      }
    }

    const firstOwnedPrivateByQuery = list.find((canvas) => !sharedOwnedIdSet.has(canvas.id));

    const localLastOpenedId = readLastOpenedCanvasId(userId);
    const serverLastOpenedId = await readServerLastOpenedCanvasId();
    const preferredLastOpenedId = [localLastOpenedId, serverLastOpenedId].find((id) => Boolean(id && accessibleById.has(id))) || null;
    const firstFromLastOpened = preferredLastOpenedId ? accessibleById.get(preferredLastOpenedId) : null;

    const first = firstFromLastOpened || firstOwnedPrivateFromAccess || firstOwnedPrivateByQuery || allAccessible[0] || list[0];
    const guestSnapshot = readGuestSnapshot();
    const hasGuestEdits = !isBlankSnapshot(guestSnapshot);

    if (!hasGuestEdits && guestSnapshot) {
      clearGuestSnapshot();
    }

    if (hasGuestEdits && guestSnapshot) {
      const latestOwned = list[0] || null;
      const baseOwnedName = latestOwned?.name || '';
      const baseParsed = parseCanvasRouteName(baseOwnedName);
      const hasOwnedCanvas = Boolean(baseOwnedName.trim());

      let canvasName = createDefaultCanvasRouteName();
      if (hasOwnedCanvas) {
        const pageSlugs = list
          .map((canvas) => parseCanvasRouteName(canvas.name))
          .filter((parsed) => parsed.canvasSlug === baseParsed.canvasSlug)
          .map((parsed) => parsed.pageSlug);
        const nextPage = nextPageSlug(pageSlugs);
        canvasName = toCanvasRouteName(baseParsed.canvasSlug, nextPage);
      }

      const snapshotPayload = {
        blocks: JSON.parse(JSON.stringify(guestSnapshot.blocks || [])),
        drawings: JSON.parse(JSON.stringify(guestSnapshot.drawings || [])),
        pan_x: guestSnapshot.pan.x,
        pan_y: guestSnapshot.pan.y,
        zoom: guestSnapshot.zoom,
      };

      let importedCanvas = await insertCanvasWithRetry(
        userId,
        canvasName,
        snapshotPayload,
        !hasOwnedCanvas
      );

      // Fallback for rare naming races: preserve guest data by creating a fresh canvas.
      if (!importedCanvas?.id && hasOwnedCanvas) {
        importedCanvas = await insertCanvasWithRetry(
          userId,
          createDefaultCanvasRouteName(),
          snapshotPayload,
          true
        );
      }

      if (importedCanvas?.id) {
        clearGuestSnapshot();
        await refreshAllCanvasCollections(userId);
        if (wasAutoLoadCancelled()) {
          isLoadingRef.current = false;
          return;
        }
        await loadCanvasById(importedCanvas.id, userId);
        isLoadingRef.current = false;
        setIsCanvasLoading(false);
        return;
      }
    }

    if (wasAutoLoadCancelled()) {
      isLoadingRef.current = false;
      return;
    }

    if (first?.id) {
      await loadCanvasById(first.id, userId);
      // Fix old default canvas name once, so URL stays in the new pattern.
      if (isLegacyUsernameCanvasName(first.name)) {
        const newName = createDefaultCanvasRouteName();
        const { error } = await supabase
          .from('canvases')
          .update({ name: newName })
          .eq('id', first.id);
        if (!error) {
          setCurrentCanvasName(newName);
          await refreshAllCanvasCollections(userId);
        }
      }
    } else {
      const bootstrapCanvas = await ensureSingleBootstrapCanvas(userId);
      if (bootstrapCanvas?.id) {
        canvasIdRef.current = bootstrapCanvas.id;
        currentCanvasIdRef.current = bootstrapCanvas.id;
        setCurrentCanvasId(bootstrapCanvas.id);
        writeLastOpenedCanvasId(userId, bootstrapCanvas.id);
        await refreshAllCanvasCollections(userId);
        await loadCanvasById(bootstrapCanvas.id, userId);
      }
    }
    isLoadingRef.current = false;
    setIsCanvasLoading(false);
  }, [ensureSingleBootstrapCanvas, insertCanvasWithRetry, loadCanvasById, readServerLastOpenedCanvasId, refreshAllCanvasCollections, warnPermissionIssue]);

  const createCanvas = useCallback(async (name?: string) => {
    if (!enabled || !session?.user?.id) return;
    const createSeq = ++loadSeqRef.current;
    isLoadingRef.current = true;
    setIsCanvasLoading(true);

    const canvasName = name?.trim() || createDefaultCanvasRouteName();
    const newCanvas = await insertCanvasWithRetry(session.user.id, canvasName, undefined, !name?.trim());

    if (createSeq !== loadSeqRef.current) {
      isLoadingRef.current = false;
      setIsCanvasLoading(false);
      return;
    }

    if (newCanvas?.id) {
      const now = new Date().toISOString();
      canvasIdRef.current = newCanvas.id;
      currentCanvasIdRef.current = newCanvas.id;
      setCurrentCanvasId(newCanvas.id);
      setCurrentCanvasName(newCanvas.name || canvasName);
      writeLastOpenedCanvasId(session.user.id, newCanvas.id);
      useCanvasStore.getState().loadCanvas([], { x: 0, y: 0 }, 1, []);
      setCanvases((prev) => {
        const next = [{ id: newCanvas.id, name: newCanvas.name || canvasName, updated_at: newCanvas.updated_at || now }, ...prev.filter((c) => c.id !== newCanvas.id)];
        return next;
      });
      void refreshAllCanvasCollections(session.user.id);
    } else {
      toast.error('Failed to create a new canvas. Please try again.');
    }
    isLoadingRef.current = false;
    setIsCanvasLoading(false);
  }, [enabled, insertCanvasWithRetry, refreshAllCanvasCollections, session?.user?.id]);

  const selectCanvas = useCallback(async (canvasId: string): Promise<boolean> => {
    if (!enabled || !canvasId) return false;
    const loaded = await loadCanvasById(canvasId, session?.user?.id, {
      allowRedirectOnMissing: false,
      showLoading: false,
    });
    if (loaded) return true;

    if (currentCanvasIdRef.current === canvasId) {
      return true;
    }

    // One quick retry helps when a prior in-flight load consumed the sequence.
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const retried = await loadCanvasById(canvasId, session?.user?.id, {
      allowRedirectOnMissing: false,
      showLoading: false,
    });
    if (retried || currentCanvasIdRef.current === canvasId) {
      return true;
    }

    try {
      const fallback = await supabase
        .from('canvases')
        .select('*')
        .eq('id', canvasId)
        .limit(1)
        .maybeSingle();

      if (fallback.error || !fallback.data) {
        const fallbackStatus = Number((fallback as any)?.status || Number((fallback.error as any)?.status || 0));
        if (fallbackStatus === 401 || fallbackStatus === 403) {
          warnPermissionIssue();
        }
        return false;
      }

      const row = fallback.data as any;
      canvasIdRef.current = row.id;
      currentCanvasIdRef.current = row.id;
      setCurrentCanvasId(row.id);
      setCurrentCanvasName(String(row.name || '') || null);
      if (session?.user?.id) {
        writeLastOpenedCanvasId(session.user.id, row.id);
        void syncServerLastOpenedCanvasId(row.id);
      }
      useCanvasStore.getState().loadCanvas(
        (row.blocks as unknown as CanvasBlock[]) || [],
        { x: Number(row.pan_x) || 0, y: Number(row.pan_y) || 0 },
        1,
        (row.drawings as DrawingElement[]) || []
      );
      setIsCanvasLoading(false);
      return true;
    } catch {
      return false;
    }
  }, [enabled, loadCanvasById, session?.user?.id, syncServerLastOpenedCanvasId, warnPermissionIssue]);

  const selectCanvasByName = useCallback(async (name: string) => {
    if (!enabled || !session?.user?.id) return;
    const requestedSeq = loadSeqRef.current;
    const { data } = await supabase
      .from('canvases')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('name', name)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (requestedSeq !== loadSeqRef.current) return;
    if (data?.id) await loadCanvasById(data.id, session.user.id);
  }, [enabled, loadCanvasById, session?.user?.id]);

  const selectCanvasByRoute = useCallback(async (ownerUsername: string, name: string, pageName?: string) => {
    if (!enabled) return;
    const requestedSeq = loadSeqRef.current;
    let { data, error } = await supabase.rpc('resolve_user_canvas', {
      p_owner_username: ownerUsername,
      p_canvas_name: name,
      p_page_name: pageName || null,
    });
    if (error) {
      const fallback = await supabase.rpc('resolve_user_canvas', {
        p_owner_username: ownerUsername,
        p_canvas_name: name,
      });
      data = fallback.data;
      error = fallback.error;
    }
    if (requestedSeq !== loadSeqRef.current) return;
    if (!error && data) {
      await loadCanvasById(String(data), session?.user?.id);
    }
  }, [enabled, loadCanvasById, session?.user?.id]);

  const deleteCanvases = useCallback(async (ids: string[]) => {
    if (!enabled || !session?.user?.id) return;
    if (!ids.length) return;
    const userId = session.user.id;

    // Invalidate any in-flight loads/saves.
    loadSeqRef.current += 1;
    isLoadingRef.current = true;

    const ownedIdSet = new Set(canvases.map((canvas) => canvas.id));
    const joinedIds = ids.filter((id) => !ownedIdSet.has(id));
    const ownedIds = ids.filter((id) => ownedIdSet.has(id));

    let hadDeleteError = false;
    let missingLeaveRpc = false;

    if (joinedIds.length) {
      const leaveRpc: any = await supabase.rpc('leave_joined_canvases', {
        p_canvas_ids: joinedIds,
      });

      if (leaveRpc?.error) {
        if (isRpcMissingError(leaveRpc.error) || isPostgrestResourceMissingError(leaveRpc.error)) {
          missingLeaveRpc = true;
        }
        // Compatibility fallback for projects where the new RPC migration is not applied yet.
        const leaveRes = await supabase
          .from('canvas_permissions')
          .delete()
          .eq('user_id', userId)
          .in('canvas_id', joinedIds);

        if (leaveRes.error) {
          hadDeleteError = true;
          if (isPermissionDeniedError(leaveRes.error)) {
            warnPermissionIssue();
          }
          if (isPostgrestResourceMissingError(leaveRes.error)) {
            warnSchemaNotDeployed();
          }
        } else {
          joinedIds.forEach((id) => removeJoinedCanvasAccess(userId, id));
        }
      } else {
        const leaveRows = Array.isArray(leaveRpc.data) ? leaveRpc.data : [];
        const leftIds = leaveRows
          .filter((row: any) => Boolean(row?.left_ok) && typeof row?.canvas_id === 'string')
          .map((row: any) => String(row.canvas_id));

        if (leftIds.length) {
          leftIds.forEach((id) => removeJoinedCanvasAccess(userId, id));
        }

        const failedCount = Math.max(0, joinedIds.length - leftIds.length);
        if (failedCount > 0) {
          hadDeleteError = true;
        }
      }
    }

    if (ownedIds.length) {
      const { error } = await supabase
        .from('canvases')
        .delete()
        .in('id', ownedIds);

      if (error) {
        hadDeleteError = true;
        if (isPermissionDeniedError(error)) {
          warnPermissionIssue();
        }
        if (isPostgrestResourceMissingError(error)) {
          warnSchemaNotDeployed();
        }
      }
    }

    const { owned, shared } = await refreshAllCanvasCollections(userId);
    if (!owned && !shared) {
      isLoadingRef.current = false;
      if (hadDeleteError) {
        toast.error('Some selected canvases could not be removed.');
      }
      return;
    }

    const accessibleAfterDelete = [
      ...((owned || []) as CanvasMeta[]),
      ...((shared || []) as CanvasMeta[]),
    ];
    const activeId = currentCanvasIdRef.current;
    const activeStillExists = activeId ? accessibleAfterDelete.some((canvas) => canvas.id === activeId) : false;

    if (activeStillExists) {
      isLoadingRef.current = false;
      if (hadDeleteError) {
        toast.error('Some selected canvases could not be removed.');
      }
      return;
    }

    const next = accessibleAfterDelete[0];
    if (next?.id) {
      await loadCanvasById(next.id, userId);
      isLoadingRef.current = false;
      if (hadDeleteError) {
        toast.error('Some selected canvases could not be removed.');
      }
      return;
    }

    // No accessible canvases left: create a new empty one in the usual pattern.
    await createCanvas();

    isLoadingRef.current = false;
    if (hadDeleteError) {
      if (missingLeaveRpc) {
        toast.error('Unable to leave collaborative canvas yet. Apply latest DB migration and retry.');
      } else {
        toast.error('Some selected canvases could not be removed.');
      }
    }
  }, [canvases, createCanvas, enabled, loadCanvasById, refreshAllCanvasCollections, removeJoinedCanvasAccess, session?.user?.id, warnPermissionIssue, warnSchemaNotDeployed]);

  const flushPendingCanvasSync = useCallback(async () => {
    if (!session?.user?.id) return;
    if (isFlushingRemoteRef.current) {
      flushRetryRequestedRef.current = true;
      return;
    }

    const userId = session.user.id;
    const inMemoryPending = Object.values(pendingSyncCacheRef.current)
      .filter((item) => item.userId === userId);
    const keys = listPendingCanvasSyncKeysForUser(userId);
    if (!keys.length && !inMemoryPending.length) return;

    const mergedByCanvasId = new Map<string, PendingCanvasSyncSnapshot>();
    for (const item of inMemoryPending) {
      mergedByCanvasId.set(item.canvasId, item);
    }
    for (const key of keys) {
      const pendingFromStorage = readPendingCanvasSync(key);
      if (!pendingFromStorage) {
        removePendingCanvasSync(key);
        continue;
      }
      const existing = mergedByCanvasId.get(pendingFromStorage.canvasId);
      if (!existing || Date.parse(existing.updatedAt) <= Date.parse(pendingFromStorage.updatedAt)) {
        mergedByCanvasId.set(pendingFromStorage.canvasId, pendingFromStorage);
      }
    }

    const pendingEntries = Array.from(mergedByCanvasId.values()).sort(
      (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
    );
    if (!pendingEntries.length) return;

    isFlushingRemoteRef.current = true;
    const batchStart = performance.now();
    let successCount = 0;
    let errorCount = 0;
    try {
      for (const pending of pendingEntries) {
        const hasKnownWriteAccess = canWriteCanvas(pending.canvasId);
        if (hasKnownWriteAccess) {
          blockedWriteCanvasIdsRef.current.delete(pending.canvasId);
        }

        if (blockedWriteCanvasIdsRef.current.has(pending.canvasId) && !hasKnownWriteAccess) {
          // Keep pending snapshot for retry; role map can lag right after share/open.
          pendingSyncCacheRef.current[pending.canvasId] = pending;
          writePendingCanvasSync(pending);
          continue;
        }

        const requestStart = performance.now();
        const { error } = await supabase
          .from('canvases')
          .update({
            blocks: pending.blocks,
            drawings: pending.drawings,
            pan_x: pending.pan.x,
            pan_y: pending.pan.y,
            zoom: pending.zoom,
          } as any)
          .eq('id', pending.canvasId);

        const requestDurationMs = performance.now() - requestStart;
        const queuedAtMs = typeof pending.queuedAtMs === 'number'
          ? pending.queuedAtMs
          : Date.parse(pending.updatedAt);
        const queueDelayMs = Number.isFinite(queuedAtMs)
          ? Math.max(0, Date.now() - queuedAtMs)
          : 0;

        if (!error) {
          successCount += 1;
          delete pendingSyncCacheRef.current[pending.canvasId];
          removePendingCanvasSync(pendingCanvasSyncKey(userId, pending.canvasId));
          setCanvases((prev) => prev.map((c) => (
            c.id === pending.canvasId
              ? { ...c, updated_at: pending.updatedAt }
              : c
          )));
          recordPerfMetric('autosave_flush_success', requestDurationMs, {
            queue_delay_ms: Math.round(queueDelayMs),
            blocks: pending.blocks.length,
            drawings: pending.drawings.length,
          });
        } else {
          errorCount += 1;
          if (isPermissionDeniedError(error)) {
            warnPermissionIssue();
            blockedWriteCanvasIdsRef.current.add(pending.canvasId);
            // Keep pending data; permission can recover after share/role sync.
            pendingSyncCacheRef.current[pending.canvasId] = pending;
            writePendingCanvasSync(pending);
          } else {
            // Persist failed network sync for retry across reloads.
            pendingSyncCacheRef.current[pending.canvasId] = pending;
            writePendingCanvasSync(pending);
          }
          recordPerfMetric('autosave_flush_error', requestDurationMs, {
            queue_delay_ms: Math.round(queueDelayMs),
            message: error.message || 'unknown',
          });
        }
      }
      recordPerfMetric('autosave_flush_batch', performance.now() - batchStart, {
        size: pendingEntries.length,
        success: successCount,
        error: errorCount,
      });
    } finally {
      isFlushingRemoteRef.current = false;
      if (flushRetryRequestedRef.current) {
        flushRetryRequestedRef.current = false;
        window.setTimeout(() => {
          void flushPendingCanvasSync();
        }, 0);
      }
    }
  }, [canWriteCanvas, session?.user?.id, warnPermissionIssue]);

  const persistInMemoryPendingSync = useCallback(() => {
    const entries = Object.values(pendingSyncCacheRef.current);
    for (const snapshot of entries) {
      writePendingCanvasSync(snapshot);
    }
  }, []);

  const renameCanvas = useCallback(async (nextCanvasName: string) => {
    if (!session?.user?.id || !currentCanvasIdRef.current || !currentCanvasName) return false;

    const currentParsed = parseCanvasRouteName(currentCanvasName);
    const nextCanvasSlug = parseCanvasRouteName(`${nextCanvasName}/${currentParsed.pageSlug}`).canvasSlug;
    if (nextCanvasSlug === currentParsed.canvasSlug) return true;

    const { data: allRows } = await supabase
      .from('canvases')
      .select('id,name')
      .eq('user_id', session.user.id);

    const all = (allRows || []) as { id: string; name: string }[];
    const targetRows = all.filter((row) => parseCanvasRouteName(row.name).canvasSlug === currentParsed.canvasSlug);
    if (!targetRows.length) return false;

    const updates = targetRows.map((row) => {
      const parsed = parseCanvasRouteName(row.name);
      return { id: row.id, name: toCanvasRouteName(nextCanvasSlug, parsed.pageSlug) };
    });

    const targetIds = new Set(updates.map((row) => row.id));
    const targetNames = new Set(updates.map((row) => row.name));
    const conflict = all.some((row) => !targetIds.has(row.id) && targetNames.has(row.name));
    if (conflict) {
      toast.error('Canvas rename conflicts with existing page names');
      return false;
    }

    for (const row of updates) {
      const { error } = await supabase
        .from('canvases')
        .update({ name: row.name })
        .eq('id', row.id);
      if (error) {
        toast.error('Failed to rename canvas');
        return false;
      }
    }

    const currentRenamed = updates.find((row) => row.id === currentCanvasIdRef.current);
    if (currentRenamed) {
      setCurrentCanvasName(currentRenamed.name);
    }
    await refreshAllCanvasCollections(session.user.id);
    toast.success('Canvas renamed');
    return true;
  }, [currentCanvasName, refreshAllCanvasCollections, session?.user?.id]);

  const renamePage = useCallback(async (nextPageName: string) => {
    if (!session?.user?.id || !currentCanvasIdRef.current || !currentCanvasName) return false;

    const currentParsed = parseCanvasRouteName(currentCanvasName);
    const nextName = toCanvasRouteName(currentParsed.canvasSlug, nextPageName);
    if (nextName === currentCanvasName) return true;

    const { data: conflictRow } = await supabase
      .from('canvases')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('name', nextName)
      .neq('id', currentCanvasIdRef.current)
      .maybeSingle();

    if (conflictRow?.id) {
      toast.error('Page name already exists in this canvas');
      return false;
    }

    const { error } = await supabase
      .from('canvases')
      .update({ name: nextName })
      .eq('id', currentCanvasIdRef.current);

    if (error) {
      toast.error('Failed to rename page');
      return false;
    }

    setCurrentCanvasName(nextName);
    await refreshAllCanvasCollections(session.user.id);
    toast.success('Page renamed');
    return true;
  }, [currentCanvasName, refreshAllCanvasCollections, session?.user?.id]);

  const saveCanvas = useCallback(() => {
    if (!session?.user?.id || !canvasIdRef.current || isLoadingRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      const canvasId = canvasIdRef.current;
      if (!canvasId) return;
      if (blockedWriteCanvasIdsRef.current.has(canvasId) && !canWriteCanvas(canvasId)) return;

      const blocksPayload = JSON.parse(JSON.stringify(blocks)) as CanvasBlock[];
      const drawingsPayload = JSON.parse(JSON.stringify(drawingElements)) as DrawingElement[];
      const signature = JSON.stringify([blocksPayload, drawingsPayload, pan.x, pan.y, zoom]);
      if (lastQueuedSignatureByCanvasRef.current[canvasId] === signature) {
        return;
      }

      pendingSyncCacheRef.current[canvasId] = {
        userId: session.user.id,
        canvasId,
        blocks: blocksPayload,
        drawings: drawingsPayload,
        pan,
        zoom,
        queuedAtMs: Date.now(),
        updatedAt: new Date().toISOString(),
        signature,
      };
      lastQueuedSignatureByCanvasRef.current[canvasId] = signature;

      // Push to DB shortly after user pauses input; do not wait for 60s interval.
      if (flushSoonTimeoutRef.current) {
        clearTimeout(flushSoonTimeoutRef.current);
      }
      flushSoonTimeoutRef.current = setTimeout(() => {
        flushSoonTimeoutRef.current = undefined;
        void flushPendingCanvasSync();
      }, 240);
    }, 120);
  }, [canWriteCanvas, flushPendingCanvasSync, session]);

  const saveGuestCanvas = useCallback(() => {
    if (session?.user?.id || isLoadingRef.current) return;
    if (guestSaveTimeoutRef.current) clearTimeout(guestSaveTimeoutRef.current);
    guestSaveTimeoutRef.current = setTimeout(() => {
      const { blocks, pan, zoom, drawingElements } = useCanvasStore.getState();
      const blocksPayload = JSON.parse(JSON.stringify(blocks));
      const drawingsPayload = JSON.parse(JSON.stringify(drawingElements));
      const signature = JSON.stringify([blocksPayload, drawingsPayload, pan.x, pan.y, zoom]);
      if (signature === lastGuestSignatureRef.current) {
        return;
      }

      writeGuestSnapshot({
        blocks: blocksPayload,
        drawings: drawingsPayload,
        pan,
        zoom,
      });
      lastGuestSignatureRef.current = signature;
    }, 700);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!enabled) {
      setIsCanvasLoading(false);
      return;
    }

    blockedWriteCanvasIdsRef.current.clear();

    if (session?.user?.id) {
      const userId = session.user.id;
      const now = Date.now();
      const lastAt = lastAutoLoadAtByUserRef.current[userId] || 0;

      // Dedupe immediate effect reruns (including StrictMode/dev remount behavior).
      if (autoLoadInFlightUserIdRef.current === userId || now - lastAt < 800) {
        return;
      }

      autoLoadInFlightUserIdRef.current = userId;
      lastAutoLoadAtByUserRef.current[userId] = now;

      void loadCanvas(userId)
        .catch(() => {
          setIsCanvasLoading(false);
        })
        .finally(() => {
          if (autoLoadInFlightUserIdRef.current === userId) {
            autoLoadInFlightUserIdRef.current = null;
          }
          lastAutoLoadAtByUserRef.current[userId] = Date.now();
        });
    } else {
      autoLoadInFlightUserIdRef.current = null;
      canvasIdRef.current = null;
      currentCanvasIdRef.current = null;
      setCurrentCanvasId(null);
      setCurrentCanvasName(null);
      blockedWriteCanvasIdsRef.current.clear();
      setCanvases([]);
      setSharedCanvases([]);
      setShareAccessByCanvasId({});
      setJoinedCanvasAccessByCanvasId({});
      const guestSnapshot = readGuestSnapshot();
      if (guestSnapshot) {
        useCanvasStore.getState().loadCanvas(
          guestSnapshot.blocks || [],
          guestSnapshot.pan || { x: 0, y: 0 },
          1,
          guestSnapshot.drawings || []
        );
      } else {
        useCanvasStore.getState().loadCanvas([], { x: 0, y: 0 }, 1);
      }
      setIsCanvasLoading(false);
    }
  }, [enabled, session?.user?.id, loadCanvas]);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;
    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (
        state.blocks === prevState.blocks &&
        state.drawingElements === prevState.drawingElements &&
        state.pan === prevState.pan &&
        state.zoom === prevState.zoom
      ) {
        return;
      }
      saveCanvas();
    });
    return () => unsub();
  }, [enabled, session?.user?.id, saveCanvas]);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;

    void flushPendingCanvasSync();

    const intervalId = window.setInterval(() => {
      void flushPendingCanvasSync();
    }, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistInMemoryPendingSync();
        void flushPendingCanvasSync();
      }
    };

    const onBeforeUnload = () => {
      persistInMemoryPendingSync();
      void flushPendingCanvasSync();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(intervalId);
      if (flushSoonTimeoutRef.current) {
        clearTimeout(flushSoonTimeoutRef.current);
        flushSoonTimeoutRef.current = undefined;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [enabled, flushPendingCanvasSync, persistInMemoryPendingSync, session?.user?.id]);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;

    const userId = session.user.id;
    let stopped = false;

    const refreshCollections = (force = false) => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return;
      if (isLoadingRef.current) return;
      void refreshAllCanvasCollectionsThrottled(userId, {
        force,
        minGapMs: force ? 1000 : 3000,
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCollections(true);
      }
    };

    const onFocus = () => {
      refreshCollections(true);
    };

    const onShareAccessUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ canvasId?: string; accessLevel?: CanvasAccessLevel; published?: boolean }>;
      const canvasId = String(custom?.detail?.canvasId || '').trim();
      const accessLevel = custom?.detail?.accessLevel;
      const published = custom?.detail?.published;

      if (canvasId) {
        setShareAccessByCanvasId((prev) => {
          const next = { ...prev };
          if (published === false) {
            delete next[canvasId];
            return next;
          }
          if (accessLevel === 'editor' || accessLevel === 'viewer') {
            next[canvasId] = accessLevel;
            return next;
          }
          return prev;
        });
      }
      refreshCollections(true);
    };

    const intervalId = window.setInterval(() => refreshCollections(false), 20_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('cnvs-share-access-updated', onShareAccessUpdated as EventListener);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('cnvs-share-access-updated', onShareAccessUpdated as EventListener);
    };
  }, [enabled, refreshAllCanvasCollectionsThrottled, session?.user?.id]);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;
    if (isLoadingRef.current || accessRecoveryInFlightRef.current) return;

    const activeCanvasId = currentCanvasIdRef.current;
    if (!activeCanvasId) return;

    const stillOwned = canvases.some((canvas) => canvas.id === activeCanvasId);
    const stillJoined = sharedCanvases.some((canvas) => canvas.id === activeCanvasId);
    if (stillOwned || stillJoined) return;

    const nextCanvas = canvases[0] || sharedCanvases[0] || null;
    accessRecoveryInFlightRef.current = true;

    void (async () => {
      try {
        if (nextCanvas?.id) {
          await loadCanvasById(nextCanvas.id, session.user.id);
          return;
        }
        await createCanvas();
      } finally {
        accessRecoveryInFlightRef.current = false;
      }
    })();
  }, [canvases, createCanvas, enabled, loadCanvasById, session?.user?.id, sharedCanvases]);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;

    const userId = session.user.id;
    let disposed = false;

    const triggerRefresh = () => {
      if (disposed) return;
      if (document.visibilityState !== 'visible') return;
      if (isLoadingRef.current) return;
      void refreshAllCanvasCollectionsThrottled(userId, {
        force: true,
        minGapMs: 800,
      });
    };

    const channel = supabase
      .channel(`cnvs-sync-live-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canvases' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_canvases' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canvas_permissions' }, triggerRefresh)
      .subscribe();

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, refreshAllCanvasCollectionsThrottled, session?.user?.id]);

  useEffect(() => {
    if (!enabled || session?.user?.id) return;
    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (
        state.blocks === prevState.blocks &&
        state.drawingElements === prevState.drawingElements &&
        state.pan === prevState.pan &&
        state.zoom === prevState.zoom
      ) {
        return;
      }
      saveGuestCanvas();
    });
    return () => unsub();
  }, [enabled, session?.user?.id, saveGuestCanvas]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (guestSaveTimeoutRef.current) clearTimeout(guestSaveTimeoutRef.current);
      persistInMemoryPendingSync();
      void flushPendingCanvasSync();
    };
  }, [flushPendingCanvasSync, persistInMemoryPendingSync]);

  return {
    canvasId: canvasIdRef.current,
    currentCanvasId,
    currentCanvasName,
    canvases,
    sharedCanvases,
    shareAccessByCanvasId,
    joinedCanvasAccessByCanvasId,
    markJoinedCanvasAccess,
    selectCanvas,
    selectCanvasByName,
    selectCanvasByRoute,
    createCanvas,
    deleteCanvases,
    renameCanvas,
    renamePage,
    isCanvasLoading,
  };
}
