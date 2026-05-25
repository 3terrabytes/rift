import { Router } from 'express';
import { sql } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const uid = req.user.uid;
  const rows = await sql`SELECT item_key, quantity FROM inventory_items WHERE user_id = ${uid}`;
  res.json({ items: rows });
});

router.post('/add', async (req, res) => {
  const uid = req.user.uid;
  const { item_key, quantity } = req.body || {};
  if (!item_key || typeof quantity !== 'number') {
    return res.status(400).json({ error: 'item_key and numeric quantity required' });
  }
  await sql`
    INSERT INTO inventory_items (user_id, item_key, quantity)
    VALUES (${uid}, ${item_key}, ${quantity})
    ON CONFLICT (user_id, item_key) DO UPDATE
      SET quantity = inventory_items.quantity + EXCLUDED.quantity
  `;
  res.json({ ok: true });
});

router.post('/consume', async (req, res) => {
  const uid = req.user.uid;
  const { item_key, quantity } = req.body || {};
  if (!item_key || typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ error: 'item_key and positive quantity required' });
  }
  const rows = await sql`SELECT quantity FROM inventory_items WHERE user_id = ${uid} AND item_key = ${item_key}`;
  const have = rows[0]?.quantity || 0;
  if (have < quantity) return res.status(400).json({ error: 'not enough' });
  await sql`UPDATE inventory_items SET quantity = quantity - ${quantity}
            WHERE user_id = ${uid} AND item_key = ${item_key}`;
  res.json({ ok: true });
});

export default router;
