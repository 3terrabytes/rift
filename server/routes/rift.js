import { Router } from 'express';
import { sql } from '../db.js';
import { authMiddleware } from '../auth.js';
import { deflateSync, inflateSync } from 'node:zlib';
import crypto from 'node:crypto';

const router = Router();
router.use(authMiddleware);

const FILE_MAGIC = 'RIFT';
const FILE_VERSION = 1;

function signPayload(buf) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

function verifySignature(buf, sig) {
  const expected = signPayload(buf);
  // Constant-time compare.
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

async function getRole(worldId, userId) {
  const r = await sql`SELECT role FROM world_permissions WHERE world_id = ${worldId} AND user_id = ${userId} LIMIT 1`;
  return r[0]?.role || null;
}

// Export world to a .rift file. Owners only.
router.get('/export/:worldId', async (req, res) => {
  const uid = req.user.uid;
  const worldId = Number(req.params.worldId);
  const role = await getRole(worldId, uid);
  if (role !== 'owner') return res.status(403).json({ error: 'owner only' });

  const wRows = await sql`SELECT id, name, seed, owner_id, created_at, updated_at FROM worlds WHERE id = ${worldId}`;
  const world = wRows[0];
  if (!world) return res.status(404).json({ error: 'world not found' });
  const sRows = await sql`SELECT terrain, placed, puzzles, shrines, unlocks, removed_nodes, drops FROM world_state WHERE world_id = ${worldId}`;
  const state = sRows[0] || { terrain: {}, placed: [], puzzles: {}, shrines: {}, unlocks: [], removed_nodes: [], drops: [] };
  const pRows = await sql`
    SELECT u.username, p.role
    FROM world_permissions p JOIN users u ON u.id = p.user_id
    WHERE p.world_id = ${worldId}
  `;
  const invRows = await sql`SELECT item_key, quantity FROM inventory_items WHERE user_id = ${uid}`;
  const charRows = await sql`SELECT appearance, last_x, last_y FROM characters WHERE user_id = ${uid}`;

  const snapshot = {
    magic: FILE_MAGIC,
    version: FILE_VERSION,
    timestamp: new Date().toISOString(),
    world: {
      name: world.name,
      seed: Number(world.seed),
      created_at: world.created_at,
    },
    state,
    permissions: pRows, // list of { username, role }
    player: {
      appearance: charRows[0]?.appearance || { skin: 'light-brown', eyes: 'blue' },
      position: { x: charRows[0]?.last_x || 0, y: charRows[0]?.last_y || 0 },
      inventory: invRows,
    },
  };

  const json = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const compressed = deflateSync(json);
  const signature = signPayload(compressed);

  const fileObj = {
    magic: FILE_MAGIC,
    version: FILE_VERSION,
    signature,
    payload: compressed.toString('base64'),
  };
  const fileBytes = Buffer.from(JSON.stringify(fileObj), 'utf8');

  const safeName = String(world.name).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'world';
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.rift"`);
  res.send(fileBytes);
});

// Import .rift to create/overwrite a world.
// Body: { file: <base64 of full file>, overwrite_world_id?: number }
router.post('/import', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { file, overwrite_world_id } = req.body || {};
    if (!file || typeof file !== 'string') return res.status(400).json({ error: 'file (base64) required' });

    const fileBuf = Buffer.from(file, 'base64');
    let fileObj;
    try { fileObj = JSON.parse(fileBuf.toString('utf8')); }
    catch { return res.status(400).json({ error: 'invalid file' }); }

    if (fileObj.magic !== FILE_MAGIC) return res.status(400).json({ error: 'not a .rift file' });
    if (fileObj.version !== FILE_VERSION) return res.status(400).json({ error: 'unsupported version' });

    const payload = Buffer.from(fileObj.payload, 'base64');
    if (!verifySignature(payload, fileObj.signature)) {
      return res.status(400).json({ error: 'invalid signature' });
    }
    const json = inflateSync(payload).toString('utf8');
    const snap = JSON.parse(json);

    // Determine target world.
    let worldId = overwrite_world_id ? Number(overwrite_world_id) : null;
    if (worldId) {
      const role = await getRole(worldId, uid);
      if (role !== 'owner') return res.status(403).json({ error: 'owner only' });
      await sql`UPDATE worlds SET name = ${snap.world.name}, seed = ${snap.world.seed}, updated_at = NOW() WHERE id = ${worldId}`;
    } else {
      const newRows = await sql`
        INSERT INTO worlds (owner_id, name, seed)
        VALUES (${uid}, ${snap.world.name}, ${snap.world.seed})
        RETURNING id
      `;
      worldId = newRows[0].id;
      await sql`INSERT INTO world_permissions (world_id, user_id, role)
                VALUES (${worldId}, ${uid}, 'owner')
                ON CONFLICT DO NOTHING`;
    }

    // Restore world_state.
    const st = snap.state || {};
    await sql`
      INSERT INTO world_state (world_id, terrain, placed, puzzles, shrines, unlocks, removed_nodes, drops)
      VALUES (
        ${worldId},
        ${JSON.stringify(st.terrain || {})}::jsonb,
        ${JSON.stringify(st.placed  || [])}::jsonb,
        ${JSON.stringify(st.puzzles || {})}::jsonb,
        ${JSON.stringify(st.shrines || {})}::jsonb,
        ${JSON.stringify(st.unlocks || [])}::jsonb,
        ${JSON.stringify(st.removed_nodes || [])}::jsonb,
        ${JSON.stringify(st.drops || [])}::jsonb
      )
      ON CONFLICT (world_id) DO UPDATE SET
        terrain       = EXCLUDED.terrain,
        placed        = EXCLUDED.placed,
        puzzles       = EXCLUDED.puzzles,
        shrines       = EXCLUDED.shrines,
        unlocks       = EXCLUDED.unlocks,
        removed_nodes = EXCLUDED.removed_nodes,
        drops         = EXCLUDED.drops,
        updated_at = NOW()
    `;

    // Restore guest invites (skip owner; owner is the importer).
    if (Array.isArray(snap.permissions)) {
      for (const p of snap.permissions) {
        if (!p.username || p.role !== 'guest') continue;
        const u = await sql`SELECT id FROM users WHERE username = ${p.username} LIMIT 1`;
        if (u[0]) {
          await sql`INSERT INTO world_permissions (world_id, user_id, role)
                    VALUES (${worldId}, ${u[0].id}, 'guest')
                    ON CONFLICT DO NOTHING`;
        }
      }
    }

    // Restore player inventory (merge).
    if (Array.isArray(snap.player?.inventory)) {
      for (const it of snap.player.inventory) {
        if (!it.item_key || typeof it.quantity !== 'number') continue;
        await sql`
          INSERT INTO inventory_items (user_id, item_key, quantity)
          VALUES (${uid}, ${it.item_key}, ${it.quantity})
          ON CONFLICT (user_id, item_key) DO UPDATE
            SET quantity = inventory_items.quantity + EXCLUDED.quantity
        `;
      }
    }

    res.json({ ok: true, world_id: worldId });
  } catch (err) {
    console.error('[rift import]', err);
    res.status(500).json({ error: 'import failed' });
  }
});

export default router;
