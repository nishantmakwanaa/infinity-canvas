import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, type ActiveTool, type CanvasBlock, type DrawingElement } from '@/store/canvasStore';

interface CollabIdentity {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface PresenceMeta {
  user_id?: string;
  display_name?: string;
  avatar_url?: string | null;
  active_tool?: ActiveTool;
  pan?: { x: number; y: number };
  zoom?: number;
  last_seen_at?: number;
  client_id?: string;
  cursor_x?: number | null;
  cursor_y?: number | null;
}

interface UserSnapshot {
  blocks: CanvasBlock[];
  drawings: DrawingElement[];
  pan: { x: number; y: number };
  zoom: number;
  sentAt: number;
}

interface CursorState {
  x: number | null;
  y: number | null;
  updatedAt: number;
}

export interface ActiveCollaborator {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  activeTool: ActiveTool | null;
  isVisible: boolean;
  color: string;
  isSelf?: boolean;
  cursorX?: number | null;
  cursorY?: number | null;
}

function colorFromId(id: string) {
  const palette = [
    '#0f766e', '#1d4ed8', '#b45309', '#be123c', '#6d28d9',
    '#0369a1', '#166534', '#7c2d12', '#9f1239', '#312e81',
    '#92400e', '#4d7c0f', '#0f172a', '#7e22ce', '#155e75',
    '#14532d', '#7f1d1d', '#1e3a8a', '#365314', '#831843',
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

const COLLABORATOR_COLORS = [
  '#0f766e', '#1d4ed8', '#b45309', '#be123c', '#6d28d9',
  '#0369a1', '#166534', '#7c2d12', '#9f1239', '#312e81',
  '#92400e', '#4d7c0f', '#0f172a', '#7e22ce', '#155e75',
  '#14532d', '#7f1d1d', '#1e3a8a', '#365314', '#831843',
];

function snapshotsEqual(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useCanvasCollaboration(
  canvasId: string | null,
  identity: CollabIdentity | null,
  enabled: boolean,
  requireEditorSlot = false
) {
  const channelRef = useRef<any>(null);
  const clientIdRef = useRef<string>(`client-${Math.random().toString(36).slice(2, 10)}`);
  const applyRemoteRef = useRef(false);
  const lastBroadcastRef = useRef<any>(null);
  const latestRemoteSnapshotRef = useRef<Record<string, UserSnapshot>>({});
  const localSnapshotRef = useRef<UserSnapshot | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sendTimeoutRef = useRef<number | null>(null);
  const cursorSendTimeoutRef = useRef<number | null>(null);
  const viewportSendTimeoutRef = useRef<number | null>(null);
  const visibilityRef = useRef<Record<string, boolean>>({});
  const connectedRef = useRef(false);
  const slotGrantedRef = useRef(true);
  const cursorRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const lastAppliedSnapshotUserIdRef = useRef<string | null>(null);
  const viewportTargetRef = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null);
  const viewportAnimationRef = useRef<number | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<ActiveCollaborator[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [cursorByUserId, setCursorByUserId] = useState<Record<string, CursorState>>({});
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [editorSlotGranted, setEditorSlotGranted] = useState(true);
  const [editorSlotActiveCount, setEditorSlotActiveCount] = useState(0);
  const [editorSlotLimitCount, setEditorSlotLimitCount] = useState(20);

  useEffect(() => {
    visibilityRef.current = visibilityMap;
  }, [visibilityMap]);

  const sendPresence = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !identity) return;
    if (!connectedRef.current) return;
    if (!slotGrantedRef.current) return;
    const state = useCanvasStore.getState();
    void channel.track({
      user_id: identity.id,
      display_name: identity.displayName,
      avatar_url: identity.avatarUrl,
      active_tool: state.activeTool,
      cursor_x: null,
      cursor_y: null,
      last_seen_at: Date.now(),
      client_id: clientIdRef.current,
    } satisfies PresenceMeta);
  }, [identity]);

  const broadcastCursor = useCallback((x: number | null, y: number | null) => {
    const channel = channelRef.current;
    if (!channel || !identity) return;
    if (!connectedRef.current) return;
    if (!slotGrantedRef.current) return;
    if (visibilityRef.current[identity.id] === false) return;

    void channel.send({
      type: 'broadcast',
      event: 'cursor_move',
      payload: {
        user_id: identity.id,
        client_id: clientIdRef.current,
        cursor_x: x,
        cursor_y: y,
        sent_at: Date.now(),
      },
    });
  }, [identity]);

  const broadcastViewport = useCallback((pan: { x: number; y: number }, zoom: number) => {
    // Viewport syncing is intentionally disabled to keep each user's camera independent.
    void pan;
    void zoom;
  }, [identity]);

  const broadcastSnapshot = useCallback((
    blocks: CanvasBlock[],
    drawings: DrawingElement[],
    pan: { x: number; y: number },
    zoom: number,
    options?: { recipientClientId?: string; force?: boolean }
  ) => {
    const channel = channelRef.current;
    if (!channel || !identity) return;
    if (!connectedRef.current) return;
    if (!slotGrantedRef.current) return;

    const payload = {
      user_id: identity.id,
      client_id: clientIdRef.current,
      recipient_client_id: options?.recipientClientId || null,
      sent_at: Date.now(),
      snapshot: {
        blocks,
        drawings,
        pan,
        zoom,
      },
    };

    if (!options?.force && snapshotsEqual(payload.snapshot, lastBroadcastRef.current)) return;
    lastBroadcastRef.current = payload.snapshot;

    void channel.send({
      type: 'broadcast',
      event: 'canvas_snapshot',
      payload,
    });
  }, [identity]);

  const stopViewportAnimation = useCallback(() => {
    viewportTargetRef.current = null;
    if (viewportAnimationRef.current) {
      window.cancelAnimationFrame(viewportAnimationRef.current);
      viewportAnimationRef.current = null;
    }
  }, []);

  const animateViewportToTarget = useCallback(() => {
    const target = viewportTargetRef.current;
    if (!target) {
      viewportAnimationRef.current = null;
      return;
    }

    const store = useCanvasStore.getState();
    const currentPan = store.pan;
    const currentZoom = store.zoom;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const nextPan = {
      x: lerp(currentPan.x, target.pan.x, 0.28),
      y: lerp(currentPan.y, target.pan.y, 0.28),
    };
    const nextZoom = lerp(currentZoom, target.zoom, 0.28);

    const done =
      Math.abs(target.pan.x - currentPan.x) < 0.4 &&
      Math.abs(target.pan.y - currentPan.y) < 0.4 &&
      Math.abs(target.zoom - currentZoom) < 0.0025;

    applyRemoteRef.current = true;
    if (done) {
      store.setPan(target.pan);
      store.setZoom(target.zoom);
    } else {
      store.setPan(nextPan);
      store.setZoom(nextZoom);
    }
    applyRemoteRef.current = false;

    if (done) {
      viewportTargetRef.current = null;
      viewportAnimationRef.current = null;
      return;
    }

    viewportAnimationRef.current = window.requestAnimationFrame(animateViewportToTarget);
  }, []);

  const queueViewportTarget = useCallback((pan: { x: number; y: number }, zoom: number) => {
    void pan;
    void zoom;
  }, [animateViewportToTarget]);

  const applyStoredSnapshotForUser = useCallback((userId: string) => {
    const snapshot = userId === identity?.id ? localSnapshotRef.current : latestRemoteSnapshotRef.current[userId];
    if (!snapshot) return;
    const localViewport = useCanvasStore.getState();
    applyRemoteRef.current = true;
    useCanvasStore.getState().applyRemoteSnapshot(
      snapshot.blocks,
      localViewport.pan,
      localViewport.zoom,
      snapshot.drawings
    );
    lastAppliedSnapshotUserIdRef.current = userId;
    window.setTimeout(() => {
      applyRemoteRef.current = false;
    }, 0);
  }, [identity?.id]);

  const applyLatestVisibleOtherSnapshot = useCallback((hiddenUserId?: string) => {
    const candidates = Object.entries(latestRemoteSnapshotRef.current)
      .filter(([userId]) => userId !== hiddenUserId && visibilityRef.current[userId] !== false)
      .sort((a, b) => b[1].sentAt - a[1].sentAt);

    const latest = candidates[0];
    if (latest) {
      applyStoredSnapshotForUser(latest[0]);
      return;
    }

    if (identity?.id) {
      applyStoredSnapshotForUser(identity.id);
    }
  }, [applyStoredSnapshotForUser, identity?.id]);

  const syncCurrentSnapshotToRoom = useCallback(() => {
    if (!connectedRef.current || !identity?.id) return;
    if (visibilityRef.current[identity.id] === false) return;

    const current = localSnapshotRef.current || (() => {
      const state = useCanvasStore.getState();
      return {
        blocks: state.blocks,
        drawings: state.drawingElements,
        pan: state.pan,
        zoom: state.zoom,
        sentAt: Date.now(),
      } satisfies UserSnapshot;
    })();

    localSnapshotRef.current = current;
    sendPresence();
    broadcastSnapshot(current.blocks, current.drawings, current.pan, current.zoom, { force: true });
  }, [broadcastSnapshot, identity?.id, sendPresence]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    const backoffMs = Math.min(5000, 400 * attempt);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      setReconnectNonce((n) => n + 1);
    }, backoffMs);
  }, []);

  const claimEditorSlot = useCallback(async () => {
    if (!canvasId || !identity?.id) {
      slotGrantedRef.current = false;
      setEditorSlotGranted(false);
      return { granted: false, active_count: 0, limit_count: 20 };
    }

    const { data, error } = await supabase.rpc('claim_editor_slot', {
      p_canvas_id: canvasId,
      p_client_id: clientIdRef.current,
      p_ttl_seconds: 90,
    });

    const row = Array.isArray(data) ? data[0] : data;
    const granted = !error && Boolean(row?.granted);
    const activeCount = Number(row?.active_count ?? 0);
    const limitCount = Number(row?.limit_count ?? 20);

    slotGrantedRef.current = granted;
    setEditorSlotGranted(granted);
    setEditorSlotActiveCount(Number.isFinite(activeCount) ? activeCount : 0);
    setEditorSlotLimitCount(Number.isFinite(limitCount) ? limitCount : 20);

    return {
      granted,
      active_count: Number.isFinite(activeCount) ? activeCount : 0,
      limit_count: Number.isFinite(limitCount) ? limitCount : 20,
    };
  }, [canvasId, identity?.id]);

  const releaseEditorSlot = useCallback(async () => {
    if (!canvasId || !identity?.id) return;
    try {
      await supabase.rpc('release_editor_slot', { p_canvas_id: canvasId });
    } catch {
      // Ignore release failures on teardown.
    }
  }, [canvasId, identity?.id]);

  useEffect(() => {
    if (!enabled || !canvasId || !identity?.id) {
      setIsConnected((prev) => (prev ? false : prev));
      connectedRef.current = false;
      setPresenceUsers((prev) => (prev.length ? [] : prev));
      slotGrantedRef.current = true;
      setEditorSlotGranted(true);
      setEditorSlotActiveCount(0);
      setEditorSlotLimitCount(20);
      setCursorByUserId((prev) => (Object.keys(prev).length ? {} : prev));
      latestRemoteSnapshotRef.current = {};
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let slotRefreshId: number | null = null;

    const channel = supabase.channel(`canvas-collab:${canvasId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: `${identity.id}-${clientIdRef.current}` },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, PresenceMeta[]>;
        const byUserId = new Map<string, ActiveCollaborator>();

        for (const metas of Object.values(state)) {
          for (const meta of metas || []) {
            const userId = String(meta.user_id || '').trim();
            if (!userId) continue;
            const next: ActiveCollaborator = {
              userId,
              displayName: String(meta.display_name || userId),
              avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
              activeTool: (meta.active_tool as ActiveTool) || null,
              cursorX: Number.isFinite(Number(meta.cursor_x)) ? Number(meta.cursor_x) : null,
              cursorY: Number.isFinite(Number(meta.cursor_y)) ? Number(meta.cursor_y) : null,
              color: colorFromId(userId),
              isVisible: visibilityRef.current[userId] !== false,
              isSelf: userId === identity.id,
            };
            // Keep the latest observed meta per user id.
            byUserId.set(userId, next);
          }
        }

        if (!byUserId.has(identity.id)) {
          const local = useCanvasStore.getState();
          byUserId.set(identity.id, {
            userId: identity.id,
            displayName: identity.displayName || 'You',
            avatarUrl: identity.avatarUrl,
            activeTool: local.activeTool,
            cursorX: cursorRef.current.x,
            cursorY: cursorRef.current.y,
            color: colorFromId(identity.id),
            isVisible: true,
            isSelf: true,
          });
        }

        const orderedUserIds = Array.from(byUserId.keys()).sort((a, b) => a.localeCompare(b));
        const colorByUserId = new Map<string, string>();
        orderedUserIds.forEach((userId, index) => {
          colorByUserId.set(userId, COLLABORATOR_COLORS[index % COLLABORATOR_COLORS.length]);
        });

        const collabs = Array.from(byUserId.values()).sort((a, b) => {
          if (a.isSelf && !b.isSelf) return -1;
          if (!a.isSelf && b.isSelf) return 1;
          return a.displayName.localeCompare(b.displayName);
        }).map((entry) => ({
          ...entry,
          color: colorByUserId.get(entry.userId) || entry.color,
        }));
        setPresenceUsers(collabs);
      })
      .on('broadcast', { event: 'canvas_snapshot' }, ({ payload }) => {
        const senderId = String(payload?.user_id || '');
        const senderClientId = String(payload?.client_id || '');
        const recipientClientId = String(payload?.recipient_client_id || '');
        const snapshot = payload?.snapshot;

        if (recipientClientId && recipientClientId !== clientIdRef.current) return;
        if (!senderId || senderId === identity.id || senderClientId === clientIdRef.current) return;
        if (!snapshot || !Array.isArray(snapshot.blocks) || !Array.isArray(snapshot.drawings) || !snapshot.pan) return;

        latestRemoteSnapshotRef.current[senderId] = {
          blocks: snapshot.blocks as CanvasBlock[],
          drawings: snapshot.drawings as DrawingElement[],
          pan: snapshot.pan,
          zoom: typeof snapshot.zoom === 'number' ? snapshot.zoom : 1,
          sentAt: Number(payload?.sent_at) || Date.now(),
        };

        if (visibilityRef.current[senderId] === false) return;
        applyStoredSnapshotForUser(senderId);
      })
      .on('broadcast', { event: 'cursor_move' }, ({ payload }) => {
        void payload;
      })
      .on('broadcast', { event: 'viewport_move' }, ({ payload }) => {
        void payload;
      })
      .on('broadcast', { event: 'snapshot_request' }, ({ payload }) => {
        const requesterClientId = String(payload?.requester_client_id || '');
        if (!requesterClientId || requesterClientId === clientIdRef.current) return;

        if (!slotGrantedRef.current) return;
        if (identity?.id && visibilityRef.current[identity.id] === false) {
          return;
        }

        const current = localSnapshotRef.current || (() => {
          const state = useCanvasStore.getState();
          return {
            blocks: state.blocks,
            drawings: state.drawingElements,
            pan: state.pan,
            zoom: state.zoom,
            sentAt: Date.now(),
          } satisfies UserSnapshot;
        })();

        broadcastSnapshot(
          current.blocks,
          current.drawings,
          current.pan,
          current.zoom,
          { recipientClientId: requesterClientId, force: true }
        );
      });

    channel.subscribe((status: string) => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        reconnectAttemptsRef.current = 0;
        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        connectedRef.current = true;
        setIsConnected(true);
        sendPresence();
        void channel.send({
          type: 'broadcast',
          event: 'snapshot_request',
          payload: {
            requester_user_id: identity.id,
            requester_client_id: clientIdRef.current,
            sent_at: Date.now(),
          },
        });
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        connectedRef.current = false;
        setIsConnected(false);
        scheduleReconnect();
      }
    });

    channelRef.current = channel;

    if (requireEditorSlot) {
      const hadSlotBeforeClaim = slotGrantedRef.current;
      void claimEditorSlot().then((slot) => {
        if (cancelled) return;
        if (slot.granted && !hadSlotBeforeClaim) {
          syncCurrentSnapshotToRoom();
          return;
        }
        if (slot.granted) return;
        const capReached = slot.limit_count > 0 && slot.active_count >= slot.limit_count;
        if (!capReached) {
          // Keep channel alive; joined-role permission sync can lag briefly on shared links.
          return;
        }
        if (channelRef.current) {
          void supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
        connectedRef.current = false;
        setIsConnected(false);
        setPresenceUsers([]);
      });
    } else {
      slotGrantedRef.current = true;
      setEditorSlotGranted(true);
      setEditorSlotActiveCount(0);
      setEditorSlotLimitCount(20);
    }

    const heartbeatId = window.setInterval(() => {
      sendPresence();
    }, 3000);

    if (requireEditorSlot) {
      slotRefreshId = window.setInterval(() => {
        const hadSlotBeforeClaim = slotGrantedRef.current;
        void claimEditorSlot().then((slot) => {
          if (cancelled) return;
          if (slot.granted && !hadSlotBeforeClaim) {
            syncCurrentSnapshotToRoom();
            return;
          }
          if (slot.granted) return;
          const capReached = slot.limit_count > 0 && slot.active_count >= slot.limit_count;
          if (!capReached) {
            return;
          }
          if (channelRef.current) {
            void supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }
          connectedRef.current = false;
          setIsConnected(false);
          setPresenceUsers([]);
        });
      }, 5_000);
    }

    const unsubStore = useCanvasStore.subscribe((state, prevState) => {
      if (applyRemoteRef.current) return;
      if (
        state.blocks === prevState.blocks &&
        state.drawingElements === prevState.drawingElements &&
        state.pan === prevState.pan &&
        state.zoom === prevState.zoom &&
        state.activeTool === prevState.activeTool
      ) {
        return;
      }

      if (sendTimeoutRef.current) window.clearTimeout(sendTimeoutRef.current);
      const blocksChanged = state.blocks !== prevState.blocks;
      const drawingsChanged = state.drawingElements !== prevState.drawingElements;
      const panChanged = state.pan !== prevState.pan;
      const zoomChanged = state.zoom !== prevState.zoom;

      sendTimeoutRef.current = window.setTimeout(() => {
        const next = useCanvasStore.getState();
        localSnapshotRef.current = {
          blocks: next.blocks,
          drawings: next.drawingElements,
          pan: next.pan,
          zoom: next.zoom,
          sentAt: Date.now(),
        };
        sendPresence();
        if (identity?.id && visibilityRef.current[identity.id] === false) {
          return;
        }
        if (!blocksChanged && !drawingsChanged && (panChanged || zoomChanged)) {
          return;
        }
        broadcastSnapshot(next.blocks, next.drawingElements, next.pan, next.zoom);
      }, 110);
    });

    const now = useCanvasStore.getState();
    localSnapshotRef.current = {
      blocks: now.blocks,
      drawings: now.drawingElements,
      pan: now.pan,
      zoom: now.zoom,
      sentAt: Date.now(),
    };

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      if (slotRefreshId) {
        window.clearInterval(slotRefreshId);
      }
      unsubStore();
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (sendTimeoutRef.current) {
        window.clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = null;
      }
      if (cursorSendTimeoutRef.current) {
        window.clearTimeout(cursorSendTimeoutRef.current);
        cursorSendTimeoutRef.current = null;
      }
      if (viewportSendTimeoutRef.current) {
        window.clearTimeout(viewportSendTimeoutRef.current);
        viewportSendTimeoutRef.current = null;
      }
      stopViewportAnimation();
      connectedRef.current = false;
      setIsConnected((prev) => (prev ? false : prev));
      setPresenceUsers((prev) => (prev.length ? [] : prev));
      latestRemoteSnapshotRef.current = {};
      localSnapshotRef.current = null;
      slotGrantedRef.current = true;
      setEditorSlotGranted(true);
      setCursorByUserId((prev) => (Object.keys(prev).length ? {} : prev));
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (requireEditorSlot) {
        void releaseEditorSlot();
      }
    };
  }, [applyStoredSnapshotForUser, broadcastSnapshot, canvasId, claimEditorSlot, enabled, identity, reconnectNonce, releaseEditorSlot, requireEditorSlot, scheduleReconnect, sendPresence, stopViewportAnimation, syncCurrentSnapshotToRoom]);

  const toggleUserVisibility = useCallback((userId: string) => {
    const willShow = visibilityRef.current[userId] === false;
    setVisibilityMap((prev) => ({
      ...prev,
      [userId]: prev[userId] === false,
    }));
    setPresenceUsers((prev) => prev.map((item) => item.userId === userId ? { ...item, isVisible: !item.isVisible } : item));
    if (!willShow) {
      setCursorByUserId((prev) => {
        if (!prev[userId]) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
    window.setTimeout(() => {
      if (willShow) {
        applyStoredSnapshotForUser(userId);
        return;
      }

      applyLatestVisibleOtherSnapshot(userId);
    }, 0);
  }, [applyLatestVisibleOtherSnapshot, applyStoredSnapshotForUser]);

  const collaborators = useMemo(() => {
    return presenceUsers.map((entry) => ({
      ...entry,
      isVisible: visibilityMap[entry.userId] !== false,
      cursorX: cursorByUserId[entry.userId]?.x ?? entry.cursorX ?? null,
      cursorY: cursorByUserId[entry.userId]?.y ?? entry.cursorY ?? null,
    }));
  }, [cursorByUserId, presenceUsers, visibilityMap]);

  return {
    collaborators,
    isConnected,
    toggleUserVisibility,
    editorSlotGranted,
    editorSlotActiveCount,
    editorSlotLimitCount,
  };
}
