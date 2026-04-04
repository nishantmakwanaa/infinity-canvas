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
}

export interface ActiveCollaborator {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  activeTool: ActiveTool | null;
  isVisible: boolean;
  color: string;
}

function colorFromId(id: string) {
  const palette = ['#0f766e', '#1d4ed8', '#b45309', '#be123c', '#6d28d9', '#0369a1', '#166534'];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function snapshotsEqual(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useCanvasCollaboration(canvasId: string | null, identity: CollabIdentity | null, enabled: boolean) {
  const channelRef = useRef<any>(null);
  const clientIdRef = useRef<string>(`client-${Math.random().toString(36).slice(2, 10)}`);
  const applyRemoteRef = useRef(false);
  const lastBroadcastRef = useRef<any>(null);
  const latestRemoteSnapshotRef = useRef<Record<string, {
    blocks: CanvasBlock[];
    drawings: DrawingElement[];
    pan: { x: number; y: number };
    zoom: number;
  }>>({});
  const sendTimeoutRef = useRef<number | null>(null);
  const visibilityRef = useRef<Record<string, boolean>>({});

  const [isConnected, setIsConnected] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<ActiveCollaborator[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    visibilityRef.current = visibilityMap;
  }, [visibilityMap]);

  const sendPresence = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !identity) return;
    const state = useCanvasStore.getState();
    void channel.track({
      user_id: identity.id,
      display_name: identity.displayName,
      avatar_url: identity.avatarUrl,
      active_tool: state.activeTool,
      pan: state.pan,
      zoom: state.zoom,
      last_seen_at: Date.now(),
      client_id: clientIdRef.current,
    } satisfies PresenceMeta);
  }, [identity]);

  const broadcastSnapshot = useCallback((blocks: CanvasBlock[], drawings: DrawingElement[], pan: { x: number; y: number }, zoom: number) => {
    const channel = channelRef.current;
    if (!channel || !identity) return;

    const payload = {
      user_id: identity.id,
      client_id: clientIdRef.current,
      sent_at: Date.now(),
      snapshot: {
        blocks,
        drawings,
        pan,
        zoom,
      },
    };

    if (snapshotsEqual(payload.snapshot, lastBroadcastRef.current)) return;
    lastBroadcastRef.current = payload.snapshot;

    void channel.send({
      type: 'broadcast',
      event: 'canvas_snapshot',
      payload,
    });
  }, [identity]);

  const applyStoredSnapshotForUser = useCallback((userId: string) => {
    const snapshot = latestRemoteSnapshotRef.current[userId];
    if (!snapshot) return;
    applyRemoteRef.current = true;
    useCanvasStore.getState().applyRemoteSnapshot(
      snapshot.blocks,
      snapshot.pan,
      typeof snapshot.zoom === 'number' ? snapshot.zoom : 1,
      snapshot.drawings
    );
    window.setTimeout(() => {
      applyRemoteRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    if (!enabled || !canvasId || !identity?.id) {
      setIsConnected((prev) => (prev ? false : prev));
      setPresenceUsers((prev) => (prev.length ? [] : prev));
      latestRemoteSnapshotRef.current = {};
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

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
            if (!userId || userId === identity.id) continue;
            const existing = byUserId.get(userId);
            const next: ActiveCollaborator = {
              userId,
              displayName: String(meta.display_name || userId),
              avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
              activeTool: (meta.active_tool as ActiveTool) || null,
              color: colorFromId(userId),
              isVisible: visibilityRef.current[userId] !== false,
            };
            if (!existing) {
              byUserId.set(userId, next);
            }
          }
        }

        const collabs = Array.from(byUserId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
        setPresenceUsers(collabs);
      })
      .on('broadcast', { event: 'canvas_snapshot' }, ({ payload }) => {
        const senderId = String(payload?.user_id || '');
        const senderClientId = String(payload?.client_id || '');
        const snapshot = payload?.snapshot;

        if (!senderId || senderId === identity.id || senderClientId === clientIdRef.current) return;
        if (!snapshot || !Array.isArray(snapshot.blocks) || !Array.isArray(snapshot.drawings) || !snapshot.pan) return;

        latestRemoteSnapshotRef.current[senderId] = {
          blocks: snapshot.blocks as CanvasBlock[],
          drawings: snapshot.drawings as DrawingElement[],
          pan: snapshot.pan,
          zoom: typeof snapshot.zoom === 'number' ? snapshot.zoom : 1,
        };

        if (visibilityRef.current[senderId] === false) return;

        applyStoredSnapshotForUser(senderId);
      });

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        sendPresence();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setIsConnected(false);
      }
    });

    channelRef.current = channel;

    const heartbeatId = window.setInterval(() => {
      sendPresence();
    }, 3000);

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
      sendTimeoutRef.current = window.setTimeout(() => {
        const next = useCanvasStore.getState();
        sendPresence();
        broadcastSnapshot(next.blocks, next.drawingElements, next.pan, next.zoom);
      }, 220);
    });

    return () => {
      window.clearInterval(heartbeatId);
      unsubStore();
      if (sendTimeoutRef.current) {
        window.clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = null;
      }
      setIsConnected((prev) => (prev ? false : prev));
      setPresenceUsers((prev) => (prev.length ? [] : prev));
      latestRemoteSnapshotRef.current = {};
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [applyStoredSnapshotForUser, broadcastSnapshot, canvasId, enabled, identity, sendPresence]);

  const toggleUserVisibility = useCallback((userId: string) => {
    const willShow = visibilityRef.current[userId] === false;
    setVisibilityMap((prev) => ({
      ...prev,
      [userId]: prev[userId] === false,
    }));
    setPresenceUsers((prev) => prev.map((item) => item.userId === userId ? { ...item, isVisible: !(item.isVisible) } : item));
    if (willShow) {
      window.setTimeout(() => {
        applyStoredSnapshotForUser(userId);
      }, 0);
    }
  }, [applyStoredSnapshotForUser]);

  const collaborators = useMemo(() => {
    return presenceUsers.map((entry) => ({
      ...entry,
      isVisible: visibilityMap[entry.userId] !== false,
    }));
  }, [presenceUsers, visibilityMap]);

  return {
    collaborators,
    isConnected,
    toggleUserVisibility,
  };
}
