import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import { sql } from './db.js';

// In-memory session table keyed by world_id.
// Each session has: { worldId, hostUserId, clients: Map<clientId, {ws, user, x, y, dir}>, state? }
const sessions = new Map();

let nextClientId = 1;

async function getRole(worldId, userId) {
  const r = await sql`SELECT role FROM world_permissions WHERE world_id = ${worldId} AND user_id = ${userId} LIMIT 1`;
  return r[0]?.role || null;
}

function broadcast(session, payload, exceptId) {
  const text = JSON.stringify(payload);
  for (const [cid, client] of session.clients) {
    if (cid === exceptId) continue;
    if (client.ws.readyState === 1) {
      try { client.ws.send(text); } catch {}
    }
  }
}

function getOrCreateSession(worldId, hostUserId) {
  let s = sessions.get(worldId);
  if (!s) {
    s = { worldId, hostUserId, clients: new Map() };
    sessions.set(worldId, s);
  }
  return s;
}

function snapshotPlayers(session) {
  return [...session.clients.values()].map(c => ({
    id: c.id, username: c.user.username, x: c.x, y: c.y, dir: c.dir, anim: c.anim,
  }));
}

export function attachMultiplayer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let session = null;
    let client = null;

    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const worldIdParam = url.searchParams.get('world');
    if (!token || !worldIdParam) {
      ws.close(4001, 'token and world required');
      return;
    }
    const claims = verifyToken(token);
    if (!claims) { ws.close(4002, 'invalid token'); return; }
    const worldId = Number(worldIdParam);

    (async () => {
      const role = await getRole(worldId, claims.uid);
      if (!role) { ws.close(4003, 'no access'); return; }

      session = getOrCreateSession(worldId, role === 'owner' ? claims.uid : null);
      const id = nextClientId++;
      client = {
        id,
        ws,
        user: { uid: claims.uid, username: claims.username },
        role,
        x: 8, y: 8, dir: 'south', anim: 'idle',
      };
      session.clients.set(id, client);

      // Announce join.
      broadcast(session, {
        t: 'join', id, username: claims.username, x: client.x, y: client.y, dir: client.dir,
      }, id);

      ws.send(JSON.stringify({
        t: 'hello',
        you: { id, username: claims.username, role },
        players: snapshotPlayers(session),
        message: 'A traveler is entering the Rift.',
      }));
    })().catch(err => {
      console.error('[ws] init failed', err);
      try { ws.close(4500, 'server error'); } catch {}
    });

    ws.on('message', (raw) => {
      if (!session || !client) return;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      switch (msg.t) {
        case 'move': {
          if (typeof msg.x === 'number') client.x = msg.x;
          if (typeof msg.y === 'number') client.y = msg.y;
          if (typeof msg.dir === 'string') client.dir = msg.dir;
          if (typeof msg.anim === 'string') client.anim = msg.anim;
          broadcast(session, { t: 'move', id: client.id, x: client.x, y: client.y, dir: client.dir, anim: client.anim }, client.id);
          break;
        }
        case 'place': {
          // { t:'place', tile:{x,y,z,key} }
          broadcast(session, { t: 'place', by: client.id, tile: msg.tile });
          break;
        }
        case 'remove': {
          broadcast(session, { t: 'remove', by: client.id, tile: msg.tile });
          break;
        }
        case 'gather': {
          // { t:'gather', node:{x,y,key} }
          broadcast(session, { t: 'gather', by: client.id, node: msg.node });
          break;
        }
        case 'puzzle': {
          // { t:'puzzle', key, state }
          broadcast(session, { t: 'puzzle', by: client.id, key: msg.key, state: msg.state });
          break;
        }
        case 'shrine': {
          broadcast(session, { t: 'shrine', by: client.id, key: msg.key, active: msg.active });
          break;
        }
        case 'chat': {
          const text = String(msg.text || '').slice(0, 200);
          broadcast(session, { t: 'chat', from: client.user.username, text });
          break;
        }
        case 'emote': {
          broadcast(session, { t: 'emote', id: client.id, emote: String(msg.emote || '').slice(0, 16) });
          break;
        }
        default:
          break;
      }
    });

    ws.on('close', () => {
      if (session && client) {
        session.clients.delete(client.id);
        broadcast(session, { t: 'leave', id: client.id, username: client.user.username });
        if (session.clients.size === 0) sessions.delete(session.worldId);
      }
    });
  });

  return wss;
}
