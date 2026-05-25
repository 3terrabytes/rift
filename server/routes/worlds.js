import { Router } from 'express';
import { sql } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

router.use(authMiddleware);

// List worlds owned by or shared with the current user.
router.get('/', async (req, res) => {
  const uid = req.user.uid;
  const rows = await sql`
    SELECT w.id, w.name, w.seed, w.owner_id, u.username AS owner_username, p.role,
           w.created_at, w.updated_at
    FROM worlds w
    JOIN world_permissions p ON p.world_id = w.id
    JOIN users u ON u.id = w.owner_id
    WHERE p.user_id = ${uid}
    ORDER BY w.updated_at DESC
  `;
  res.json({ worlds: rows });
});

// Create a new world.
router.post('/', async (req, res) => {
  const uid = req.user.uid;
  const { name } = req.body || {};
  const worldName = (name && String(name).trim()) || 'New Rift';
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const rows = await sql`
    INSERT INTO worlds (owner_id, name, seed)
    VALUES (${uid}, ${worldName}, ${seed})
    RETURNING id, name, seed, owner_id, created_at, updated_at
  `;
  const w = rows[0];
  await sql`INSERT INTO world_state (world_id) VALUES (${w.id}) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO world_permissions (world_id, user_id, role)
            VALUES (${w.id}, ${uid}, 'owner') ON CONFLICT DO NOTHING`;
  res.json({ world: w });
});

async function getPermission(worldId, userId) {
  const rows = await sql`SELECT role FROM world_permissions WHERE world_id = ${worldId} AND user_id = ${userId} LIMIT 1`;
  return rows[0]?.role || null;
}

// Get full world state.
router.get('/:id', async (req, res) => {
  const uid = req.user.uid;
  const id = Number(req.params.id);
  const role = await getPermission(id, uid);
  if (!role) return res.status(403).json({ error: 'no access' });
  const worldRows = await sql`SELECT id, name, seed, owner_id, created_at, updated_at FROM worlds WHERE id = ${id}`;
  const stateRows = await sql`SELECT terrain, placed, puzzles, shrines, unlocks, removed_nodes, drops FROM world_state WHERE world_id = ${id}`;
  const permRows = await sql`
    SELECT u.id AS user_id, u.username, p.role
    FROM world_permissions p JOIN users u ON u.id = p.user_id
    WHERE p.world_id = ${id}
  `;
  res.json({
    world: worldRows[0],
    state: stateRows[0] || { terrain: {}, placed: [], puzzles: {}, shrines: {}, unlocks: [], removed_nodes: [], drops: [] },
    permissions: permRows,
    role
  });
});

// Save world state (owner or guest may push small changes; bigger snapshots only by owner).
router.put('/:id/state', async (req, res) => {
  const uid = req.user.uid;
  const id = Number(req.params.id);
  const role = await getPermission(id, uid);
  if (!role) return res.status(403).json({ error: 'no access' });
  const { terrain, placed, puzzles, shrines, unlocks, removed_nodes, drops } = req.body || {};
  // Ensure row exists.
  await sql`INSERT INTO world_state (world_id) VALUES (${id}) ON CONFLICT DO NOTHING`;
  if (terrain !== undefined)       await sql`UPDATE world_state SET terrain       = ${JSON.stringify(terrain)}::jsonb       WHERE world_id = ${id}`;
  if (placed  !== undefined)       await sql`UPDATE world_state SET placed        = ${JSON.stringify(placed)}::jsonb        WHERE world_id = ${id}`;
  if (puzzles !== undefined)       await sql`UPDATE world_state SET puzzles       = ${JSON.stringify(puzzles)}::jsonb       WHERE world_id = ${id}`;
  if (shrines !== undefined)       await sql`UPDATE world_state SET shrines       = ${JSON.stringify(shrines)}::jsonb       WHERE world_id = ${id}`;
  if (unlocks !== undefined)       await sql`UPDATE world_state SET unlocks       = ${JSON.stringify(unlocks)}::jsonb       WHERE world_id = ${id}`;
  if (removed_nodes !== undefined) await sql`UPDATE world_state SET removed_nodes = ${JSON.stringify(removed_nodes)}::jsonb WHERE world_id = ${id}`;
  if (drops !== undefined)         await sql`UPDATE world_state SET drops         = ${JSON.stringify(drops)}::jsonb         WHERE world_id = ${id}`;
  await sql`UPDATE world_state SET updated_at = NOW() WHERE world_id = ${id}`;
  await sql`UPDATE worlds SET updated_at = NOW() WHERE id = ${id}`;
  res.json({ ok: true });
});

// Invite a user by username (owner only).
router.post('/:id/invite', async (req, res) => {
  const uid = req.user.uid;
  const id = Number(req.params.id);
  const role = await getPermission(id, uid);
  if (role !== 'owner') return res.status(403).json({ error: 'owner only' });
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  const userRows = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
  const target = userRows[0];
  if (!target) return res.status(404).json({ error: 'user not found' });
  await sql`INSERT INTO world_permissions (world_id, user_id, role)
            VALUES (${id}, ${target.id}, 'guest')
            ON CONFLICT (world_id, user_id) DO NOTHING`;
  res.json({ ok: true });
});

// Revoke a guest (owner only).
router.delete('/:id/invite/:userId', async (req, res) => {
  const uid = req.user.uid;
  const id = Number(req.params.id);
  const targetId = Number(req.params.userId);
  const role = await getPermission(id, uid);
  if (role !== 'owner') return res.status(403).json({ error: 'owner only' });
  await sql`DELETE FROM world_permissions WHERE world_id = ${id} AND user_id = ${targetId} AND role != 'owner'`;
  res.json({ ok: true });
});

// Delete world (owner only).
router.delete('/:id', async (req, res) => {
  const uid = req.user.uid;
  const id = Number(req.params.id);
  const role = await getPermission(id, uid);
  if (role !== 'owner') return res.status(403).json({ error: 'owner only' });
  await sql`DELETE FROM worlds WHERE id = ${id}`;
  res.json({ ok: true });
});

export default router;
