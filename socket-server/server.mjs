import { createServer } from 'node:http';
import { Server } from 'socket.io';

const PORT = Number(process.env.SOCKET_PORT || process.env.PORT || 3400);
const rawOrigin = process.env.SOCKET_CORS_ORIGIN || '*';
const ORIGIN = rawOrigin.includes(',')
  ? rawOrigin.split(',').map((value) => value.trim()).filter(Boolean)
  : rawOrigin;

/** @type {Map<string, Map<string, any>>} */
const rooms = new Map();

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('CNVS Socket.IO collaboration server\n');
});

const io = new Server(server, {
  cors: {
    origin: ORIGIN,
    methods: ['GET', 'POST'],
    credentials: false,
  },
  transports: ['websocket', 'polling'],
});

function getRoomMap(canvasId) {
  if (!rooms.has(canvasId)) {
    rooms.set(canvasId, new Map());
  }
  return rooms.get(canvasId);
}

function leaveCanvas(socket) {
  const canvasId = socket.data.canvasId;
  if (!canvasId) return;

  socket.leave(`canvas:${canvasId}`);

  const room = rooms.get(canvasId);
  if (room) {
    room.delete(socket.id);
    if (room.size === 0) {
      rooms.delete(canvasId);
    }
  }

  socket.data.canvasId = null;
}

function emitPresence(canvasId) {
  const room = rooms.get(canvasId);
  if (!room) return;

  const participants = Array.from(room.values())
    .sort((a, b) => {
      const aName = String(a.display_name || a.user_id || '').toLowerCase();
      const bName = String(b.display_name || b.user_id || '').toLowerCase();
      return aName.localeCompare(bName);
    })
    .map((participant) => ({
      user_id: participant.user_id,
      display_name: participant.display_name,
      avatar_url: participant.avatar_url,
      active_tool: participant.active_tool || null,
      client_id: participant.client_id || null,
    }));

  io.to(`canvas:${canvasId}`).emit('collab:presence', {
    canvas_id: canvasId,
    participants,
    sent_at: Date.now(),
  });
}

function upsertParticipant(socket, payload = {}) {
  const canvasId = String(payload.canvas_id || socket.data.canvasId || '').trim();
  const userId = String(payload.user_id || '').trim();
  if (!canvasId || !userId) return null;

  const room = getRoomMap(canvasId);
  const prev = room.get(socket.id) || {};
  const next = {
    ...prev,
    user_id: userId,
    display_name: String(payload.display_name || prev.display_name || userId),
    avatar_url: typeof payload.avatar_url === 'string' ? payload.avatar_url : (prev.avatar_url || null),
    active_tool: payload.active_tool || prev.active_tool || null,
    client_id: String(payload.client_id || prev.client_id || ''),
    updated_at: Date.now(),
  };

  room.set(socket.id, next);
  return next;
}

io.on('connection', (socket) => {
  socket.data.canvasId = null;

  socket.on('join_canvas', (payload = {}) => {
    const canvasId = String(payload.canvas_id || '').trim();
    const userId = String(payload.user_id || '').trim();
    if (!canvasId || !userId) {
      socket.emit('collab:error', { message: 'Invalid join payload' });
      return;
    }

    if (socket.data.canvasId && socket.data.canvasId !== canvasId) {
      leaveCanvas(socket);
    }

    socket.join(`canvas:${canvasId}`);
    socket.data.canvasId = canvasId;

    upsertParticipant(socket, payload);
    emitPresence(canvasId);
  });

  socket.on('collab:presence_update', (payload = {}) => {
    const canvasId = String(payload.canvas_id || socket.data.canvasId || '').trim();
    if (!canvasId || socket.data.canvasId !== canvasId) return;

    upsertParticipant(socket, payload);
    emitPresence(canvasId);
  });

  socket.on('collab:cursor_move', (payload = {}) => {
    const canvasId = String(payload.canvas_id || socket.data.canvasId || '').trim();
    if (!canvasId || socket.data.canvasId !== canvasId) return;

    socket.to(`canvas:${canvasId}`).emit('collab:cursor_move', {
      canvas_id: canvasId,
      user_id: String(payload.user_id || ''),
      client_id: String(payload.client_id || ''),
      cursor_x: typeof payload.cursor_x === 'number' ? payload.cursor_x : null,
      cursor_y: typeof payload.cursor_y === 'number' ? payload.cursor_y : null,
      sent_at: Number(payload.sent_at) || Date.now(),
    });
  });

  socket.on('collab:viewport_move', (payload = {}) => {
    const canvasId = String(payload.canvas_id || socket.data.canvasId || '').trim();
    if (!canvasId || socket.data.canvasId !== canvasId) return;

    const pan = payload.pan;
    const zoom = payload.zoom;
    if (!pan || typeof pan.x !== 'number' || typeof pan.y !== 'number') return;
    if (typeof zoom !== 'number') return;

    socket.to(`canvas:${canvasId}`).emit('collab:viewport_move', {
      canvas_id: canvasId,
      user_id: String(payload.user_id || ''),
      client_id: String(payload.client_id || ''),
      pan: { x: pan.x, y: pan.y },
      zoom,
      sent_at: Number(payload.sent_at) || Date.now(),
    });
  });

  socket.on('collab:snapshot', (payload = {}) => {
    const canvasId = String(payload.canvas_id || socket.data.canvasId || '').trim();
    if (!canvasId || socket.data.canvasId !== canvasId) return;

    const envelope = {
      canvas_id: canvasId,
      user_id: String(payload.user_id || ''),
      client_id: String(payload.client_id || ''),
      sent_at: Number(payload.sent_at) || Date.now(),
      snapshot: payload.snapshot,
    };

    const recipientSocketId = String(payload.recipient_socket_id || '').trim();
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('collab:snapshot', envelope);
      return;
    }

    socket.to(`canvas:${canvasId}`).emit('collab:snapshot', envelope);
  });

  socket.on('collab:snapshot_request', (payload = {}) => {
    const canvasId = String(payload.canvas_id || socket.data.canvasId || '').trim();
    if (!canvasId || socket.data.canvasId !== canvasId) return;

    socket.to(`canvas:${canvasId}`).emit('collab:snapshot_request', {
      canvas_id: canvasId,
      requester_socket_id: socket.id,
      requester_user_id: String(payload.requester_user_id || ''),
      sent_at: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const canvasId = socket.data.canvasId;
    leaveCanvas(socket);
    if (canvasId) emitPresence(canvasId);
  });
});

server.listen(PORT, () => {
  console.log(`[socket] listening on :${PORT}`);
});
