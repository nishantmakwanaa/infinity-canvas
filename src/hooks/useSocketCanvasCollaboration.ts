import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { supabase } from '@/integrations/supabase/client';
import { useCanvasStore, type ActiveTool, type CanvasBlock, type DrawingElement } from '@/store/canvasStore';

interface CollabIdentity {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface UserSnapshot {
  blocks: CanvasBlock[];
  drawings: DrawingElement[];
  sentAt: number;
}

interface CursorState {
  x: number | null;
  y: number | null;
  updatedAt: number;
}

interface SocketParticipant {
  user_id?: string;
  display_name?: string;
  avatar_url?: string | null;
  active_tool?: ActiveTool;
  client_id?: string;
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

const RAW_SOCKET_SERVER_URL = (import.meta.env.VITE_SOCKET_SERVER_URL as string | undefined)?.trim() || '';

function resolveSocketServerUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (typeof window !== 'undefined' && parsed.host === window.location.host) {
      // Same-origin socket should connect directly without forcing an absolute http(s) URL.
      return '';
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return trimmed;
  }
}

const SOCKET_SERVER_URL = resolveSocketServerUrl(RAW_SOCKET_SERVER_URL);

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

export function useSocketCanvasCollaboration(
  canvasId: string | null,
  identity: CollabIdentity | null,
  enabled: boolean,
  requireEditorSlot = false
) {
  const socketRef = useRef<Socket | null>(null);
  const clientIdRef = useRef<string>(`client-${Math.random().toString(36).slice(2, 10)}`);
  const applyRemoteRef = useRef(false);
  const lastBroadcastRef = useRef<any>(null);
  const latestRemoteSnapshotRef = useRef<Record<string, UserSnapshot>>({});
  const localSnapshotRef = useRef<UserSnapshot | null>(null);
  const sendTimeoutRef = useRef<number | null>(null);
  const cursorSendTimeoutRef = useRef<number | null>(null);
  const viewportSendTimeoutRef = useRef<number | null>(null);
  const visibilityRef = useRef<Record<string, boolean>>({});
  const slotGrantedRef = useRef(true);
  const cursorRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const lastAppliedSnapshotUserIdRef = useRef<string | null>(null);

  const cursorTargetRef = useRef<Record<string, CursorState>>({});
  const cursorRenderRef = useRef<Record<string, CursorState>>({});
  const cursorAnimationRef = useRef<number | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<ActiveCollaborator[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [cursorByUserId, setCursorByUserId] = useState<Record<string, CursorState>>({});
  const [editorSlotGranted, setEditorSlotGranted] = useState(true);
  const [editorSlotActiveCount, setEditorSlotActiveCount] = useState(0);
  const [editorSlotLimitCount, setEditorSlotLimitCount] = useState(20);

  useEffect(() => {
    visibilityRef.current = visibilityMap;
  }, [visibilityMap]);

  const stopCursorAnimation = useCallback(() => {
    if (cursorAnimationRef.current) {
      window.cancelAnimationFrame(cursorAnimationRef.current);
      cursorAnimationRef.current = null;
    }
  }, []);

  const animateCursors = useCallback(() => {
    const targets = cursorTargetRef.current;
    const rendered = cursorRenderRef.current;
    const next: Record<string, CursorState> = {};
    let moving = false;

    Object.entries(targets).forEach(([userId, target]) => {
      if (visibilityRef.current[userId] === false) return;

      if (target.x === null || target.y === null) {
        next[userId] = { ...target };
        return;
      }

      const current = rendered[userId];
      if (!current || current.x === null || current.y === null) {
        next[userId] = { ...target };
        return;
      }

      const ageMs = Math.max(1, Date.now() - target.updatedAt);
      const alpha = ageMs <= 80 ? 0.45 : ageMs <= 180 ? 0.32 : 0.22;

      const nx = current.x + (target.x - current.x) * alpha;
      const ny = current.y + (target.y - current.y) * alpha;
      const done = Math.abs(target.x - nx) < 0.35 && Math.abs(target.y - ny) < 0.35;

      next[userId] = done
        ? { ...target }
        : { x: nx, y: ny, updatedAt: target.updatedAt };

      if (!done) moving = true;
    });

    cursorRenderRef.current = next;
    setCursorByUserId(next);

    if (moving) {
      cursorAnimationRef.current = window.requestAnimationFrame(animateCursors);
    } else {
      cursorAnimationRef.current = null;
    }
  }, []);

  const upsertCursorTarget = useCallback((userId: string, x: number | null, y: number | null, updatedAt: number) => {
    cursorTargetRef.current = {
      ...cursorTargetRef.current,
      [userId]: { x, y, updatedAt },
    };

    if (x === null || y === null) {
      const next = {
        ...cursorRenderRef.current,
        [userId]: { x: null, y: null, updatedAt },
      };
      cursorRenderRef.current = next;
      setCursorByUserId(next);
      return;
    }

    if (!cursorAnimationRef.current) {
      cursorAnimationRef.current = window.requestAnimationFrame(animateCursors);
    }
  }, [animateCursors]);

  const removeCursorUser = useCallback((userId: string) => {
    const nextTargets = { ...cursorTargetRef.current };
    const nextRendered = { ...cursorRenderRef.current };
    delete nextTargets[userId];
    delete nextRendered[userId];
    cursorTargetRef.current = nextTargets;
    cursorRenderRef.current = nextRendered;
    setCursorByUserId(nextRendered);
  }, []);

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

    const state = useCanvasStore.getState();
    applyRemoteRef.current = true;
    useCanvasStore.getState().applyRemoteSnapshot([], state.pan, state.zoom, []);
    lastAppliedSnapshotUserIdRef.current = null;
    window.setTimeout(() => {
      applyRemoteRef.current = false;
    }, 0);
  }, [applyStoredSnapshotForUser]);

  const sendPresence = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !identity || !canvasId) return;
    if (!slotGrantedRef.current) return;

    const state = useCanvasStore.getState();
    socket.emit('collab:presence_update', {
      canvas_id: canvasId,
      user_id: identity.id,
      display_name: identity.displayName,
      avatar_url: identity.avatarUrl,
      active_tool: state.activeTool,
      cursor_x: null,
      cursor_y: null,
      last_seen_at: Date.now(),
      client_id: clientIdRef.current,
    });
  }, [canvasId, identity]);

  const broadcastCursor = useCallback((x: number | null, y: number | null) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !identity || !canvasId) return;
    if (!slotGrantedRef.current) return;
    if (visibilityRef.current[identity.id] === false) return;

    socket.emit('collab:cursor_move', {
      canvas_id: canvasId,
      user_id: identity.id,
      client_id: clientIdRef.current,
      cursor_x: x,
      cursor_y: y,
      sent_at: Date.now(),
    });
  }, [canvasId, identity]);

  const broadcastViewport = useCallback((pan: { x: number; y: number }, zoom: number) => {
    void pan;
    void zoom;
  }, []);

  const broadcastSnapshot = useCallback((
    blocks: CanvasBlock[],
    drawings: DrawingElement[],
    options?: { recipientSocketId?: string; force?: boolean }
  ) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !identity || !canvasId) return;
    if (!slotGrantedRef.current) return;

    const payload = {
      canvas_id: canvasId,
      user_id: identity.id,
      client_id: clientIdRef.current,
      recipient_socket_id: options?.recipientSocketId || null,
      sent_at: Date.now(),
      snapshot: {
        blocks,
        drawings,
      },
    };

    if (!options?.force && snapshotsEqual(payload.snapshot, lastBroadcastRef.current)) return;
    lastBroadcastRef.current = payload.snapshot;

    socket.emit('collab:snapshot', payload);
  }, [canvasId, identity]);

  const syncCurrentSnapshotToRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !identity?.id) return;
    if (visibilityRef.current[identity.id] === false) return;

    const current = localSnapshotRef.current || (() => {
      const state = useCanvasStore.getState();
      return {
        blocks: state.blocks,
        drawings: state.drawingElements,
        sentAt: Date.now(),
      } satisfies UserSnapshot;
    })();

    localSnapshotRef.current = current;
    sendPresence();
    broadcastSnapshot(current.blocks, current.drawings, { force: true });
  }, [broadcastSnapshot, identity?.id, sendPresence]);

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
      setPresenceUsers((prev) => (prev.length ? [] : prev));
      slotGrantedRef.current = true;
      setEditorSlotGranted(true);
      setEditorSlotActiveCount(0);
      setEditorSlotLimitCount(20);
      latestRemoteSnapshotRef.current = {};
      cursorTargetRef.current = {};
      cursorRenderRef.current = {};
      setCursorByUserId((prev) => (Object.keys(prev).length ? {} : prev));
      stopCursorAnimation();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const socket = io(SOCKET_SERVER_URL || undefined, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketRef.current = socket;

    const syncPresenceUsers = (participants: SocketParticipant[]) => {
      const byUserId = new Map<string, ActiveCollaborator>();
      const activeIds = new Set<string>();

      participants.forEach((meta) => {
        const userId = String(meta?.user_id || '').trim();
        if (!userId) return;
        activeIds.add(userId);

        byUserId.set(userId, {
          userId,
          displayName: String(meta?.display_name || userId),
          avatarUrl: typeof meta?.avatar_url === 'string' ? meta.avatar_url : null,
          activeTool: (meta?.active_tool as ActiveTool) || null,
          color: colorFromId(userId),
          isVisible: visibilityRef.current[userId] !== false,
          isSelf: userId === identity.id,
        });
      });

      if (!byUserId.has(identity.id)) {
        const local = useCanvasStore.getState();
        activeIds.add(identity.id);
        byUserId.set(identity.id, {
          userId: identity.id,
          displayName: identity.displayName || 'You',
          avatarUrl: identity.avatarUrl,
          activeTool: local.activeTool,
          color: colorFromId(identity.id),
          isVisible: true,
          isSelf: true,
        });
      }

      Object.keys(cursorTargetRef.current).forEach((userId) => {
        if (!activeIds.has(userId)) removeCursorUser(userId);
      });

      const orderedUserIds = Array.from(byUserId.keys()).sort((a, b) => a.localeCompare(b));
      const colorByUserId = new Map<string, string>();
      orderedUserIds.forEach((userId, index) => {
        colorByUserId.set(userId, COLLABORATOR_COLORS[index % COLLABORATOR_COLORS.length]);
      });

      const collabs = Array.from(byUserId.values())
        .sort((a, b) => {
          if (a.isSelf && !b.isSelf) return -1;
          if (!a.isSelf && b.isSelf) return 1;
          return a.displayName.localeCompare(b.displayName);
        })
        .map((entry) => ({
          ...entry,
          color: colorByUserId.get(entry.userId) || entry.color,
        }));

      setPresenceUsers(collabs);
    };

    const handleConnect = () => {
      if (cancelled) return;

      setIsConnected(true);
      socket.emit('join_canvas', {
        canvas_id: canvasId,
        user_id: identity.id,
        display_name: identity.displayName,
        avatar_url: identity.avatarUrl,
        client_id: clientIdRef.current,
      });
      sendPresence();
      socket.emit('collab:snapshot_request', {
        canvas_id: canvasId,
        requester_user_id: identity.id,
      });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handlePresence = (payload: any) => {
      const payloadCanvasId = String(payload?.canvas_id || '').trim();
      if (payloadCanvasId && payloadCanvasId !== canvasId) return;
      const participants = Array.isArray(payload?.participants) ? payload.participants : [];
      syncPresenceUsers(participants);
    };

    const handleSnapshot = (payload: any) => {
      const senderId = String(payload?.user_id || '');
      const senderClientId = String(payload?.client_id || '');
      const snapshot = payload?.snapshot;

      if (!senderId || senderId === identity.id || senderClientId === clientIdRef.current) return;
      if (!snapshot || !Array.isArray(snapshot.blocks) || !Array.isArray(snapshot.drawings)) return;

      latestRemoteSnapshotRef.current[senderId] = {
        blocks: snapshot.blocks as CanvasBlock[],
        drawings: snapshot.drawings as DrawingElement[],
        sentAt: Number(payload?.sent_at) || Date.now(),
      };

      if (visibilityRef.current[senderId] === false) return;
      applyStoredSnapshotForUser(senderId);
    };

    const handleCursorMove = (payload: any) => {
      void payload;
    };

    const handleViewportMove = (payload: any) => {
      void payload;
    };

    const handleSnapshotRequest = (payload: any) => {
      const requesterSocketId = String(payload?.requester_socket_id || '');
      const requesterUserId = String(payload?.requester_user_id || '');
      if (!requesterSocketId) return;
      if (requesterUserId && requesterUserId === identity.id) return;

      if (!slotGrantedRef.current) return;
      if (identity?.id && visibilityRef.current[identity.id] === false) return;

      const current = localSnapshotRef.current || (() => {
        const state = useCanvasStore.getState();
        return {
          blocks: state.blocks,
          drawings: state.drawingElements,
          sentAt: Date.now(),
        } satisfies UserSnapshot;
      })();

      broadcastSnapshot(
        current.blocks,
        current.drawings,
        { recipientSocketId: requesterSocketId, force: true }
      );
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('collab:presence', handlePresence);
    socket.on('collab:snapshot', handleSnapshot);
    socket.on('collab:cursor_move', handleCursorMove);
    socket.on('collab:viewport_move', handleViewportMove);
    socket.on('collab:snapshot_request', handleSnapshotRequest);

    if (requireEditorSlot) {
      const hadSlotBeforeClaim = slotGrantedRef.current;
      void claimEditorSlot().then((slot) => {
        if (cancelled) return;
        if (slot.granted && !hadSlotBeforeClaim) {
          syncCurrentSnapshotToRoom();
        }
        const capReached = slot.limit_count > 0 && slot.active_count >= slot.limit_count;
        if (!slot.granted && capReached) {
          setIsConnected(false);
          setPresenceUsers([]);
          socket.disconnect();
          return;
        }
        socket.connect();
      });
    } else {
      slotGrantedRef.current = true;
      setEditorSlotGranted(true);
      setEditorSlotActiveCount(0);
      setEditorSlotLimitCount(20);
      socket.connect();
    }

    const heartbeatId = window.setInterval(() => {
      sendPresence();
    }, 3000);

    const slotRefreshId = requireEditorSlot
      ? window.setInterval(() => {
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

          setIsConnected(false);
          setPresenceUsers([]);
          if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
          }
        });
      }, 5_000)
      : null;

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
        sendPresence();
        if (identity?.id && visibilityRef.current[identity.id] === false) {
          return;
        }
        if (!blocksChanged && !drawingsChanged && (panChanged || zoomChanged)) {
          return;
        }
        localSnapshotRef.current = {
          blocks: next.blocks,
          drawings: next.drawingElements,
          sentAt: Date.now(),
        };
        broadcastSnapshot(next.blocks, next.drawingElements);
      }, 110);
    });

    const now = useCanvasStore.getState();
    localSnapshotRef.current = {
      blocks: now.blocks,
      drawings: now.drawingElements,
      sentAt: Date.now(),
    };

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      if (slotRefreshId) {
        window.clearInterval(slotRefreshId);
      }
      unsubStore();

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

      stopCursorAnimation();

      setIsConnected((prev) => (prev ? false : prev));
      setPresenceUsers((prev) => (prev.length ? [] : prev));
      latestRemoteSnapshotRef.current = {};
      localSnapshotRef.current = null;
      cursorTargetRef.current = {};
      cursorRenderRef.current = {};
      setCursorByUserId((prev) => (Object.keys(prev).length ? {} : prev));
      slotGrantedRef.current = true;
      setEditorSlotGranted(true);

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (requireEditorSlot) {
        void releaseEditorSlot();
      }
    };
  }, [
    applyStoredSnapshotForUser,
    broadcastSnapshot,
    canvasId,
    claimEditorSlot,
    enabled,
    identity,
    requireEditorSlot,
    releaseEditorSlot,
    removeCursorUser,
    sendPresence,
    syncCurrentSnapshotToRoom,
    stopCursorAnimation,
    upsertCursorTarget,
  ]);

  const toggleUserVisibility = useCallback((userId: string) => {
    const willShow = visibilityRef.current[userId] === false;
    visibilityRef.current = {
      ...visibilityRef.current,
      [userId]: willShow,
    };
    const isCurrentlyAppliedUser = lastAppliedSnapshotUserIdRef.current === userId;
    setVisibilityMap((prev) => ({
      ...prev,
      [userId]: willShow,
    }));
    setPresenceUsers((prev) => prev.map((item) => item.userId === userId ? { ...item, isVisible: willShow } : item));

    if (!willShow) {
      removeCursorUser(userId);
    }

    window.setTimeout(() => {
      if (willShow) {
        applyStoredSnapshotForUser(userId);
        return;
      }

      if (!isCurrentlyAppliedUser) {
        return;
      }

      applyLatestVisibleOtherSnapshot(userId);
    }, 0);
  }, [applyLatestVisibleOtherSnapshot, applyStoredSnapshotForUser, removeCursorUser]);

  const collaborators = useMemo(() => {
    return presenceUsers.map((entry) => ({
      ...entry,
      isVisible: visibilityMap[entry.userId] !== false,
      cursorX: cursorByUserId[entry.userId]?.x ?? null,
      cursorY: cursorByUserId[entry.userId]?.y ?? null,
    }));
  }, [cursorByUserId, presenceUsers, visibilityMap]);

  return {
    collaborators,
    isConnected,
    toggleUserVisibility,
    editorSlotGranted,
    editorSlotActiveCount,
    editorSlotLimitCount,
    socketServerConfigured: Boolean(RAW_SOCKET_SERVER_URL),
  };
}
