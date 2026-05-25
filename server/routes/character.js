import { Router } from 'express';
import { sql } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const uid = req.user.uid;
  const rows = await sql`SELECT appearance, last_x, last_y, last_world FROM characters WHERE user_id = ${uid}`;
  res.json({ character: rows[0] || null });
});

router.put('/', async (req, res) => {
  const uid = req.user.uid;
  const { appearance, last_x, last_y, last_world } = req.body || {};
  await sql`
    INSERT INTO characters (user_id, appearance, last_x, last_y, last_world)
    VALUES (${uid},
            ${appearance ? JSON.stringify(appearance) : JSON.stringify({skin:'light-brown',eyes:'blue'})}::jsonb,
            ${last_x ?? 0}, ${last_y ?? 0}, ${last_world ?? null})
    ON CONFLICT (user_id) DO UPDATE
      SET appearance = COALESCE(EXCLUDED.appearance, characters.appearance),
          last_x = EXCLUDED.last_x,
          last_y = EXCLUDED.last_y,
          last_world = EXCLUDED.last_world,
          updated_at = NOW()
  `;
  res.json({ ok: true });
});

export default router;
