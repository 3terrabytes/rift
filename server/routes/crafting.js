import { Router } from 'express';
import { sql } from '../db.js';
import { authMiddleware } from '../auth.js';
import { RECIPES } from '../recipes.js';

const router = Router();
router.use(authMiddleware);

router.get('/recipes', (_req, res) => {
  res.json({ recipes: RECIPES });
});

router.get('/', async (req, res) => {
  const uid = req.user.uid;
  const rows = await sql`SELECT id, item_key, data, created_at FROM crafted_items WHERE user_id = ${uid} ORDER BY id DESC`;
  res.json({ crafted: rows });
});

router.post('/craft', async (req, res) => {
  const uid = req.user.uid;
  const { recipe_key } = req.body || {};
  const recipe = RECIPES.find(r => r.key === recipe_key);
  if (!recipe) return res.status(400).json({ error: 'unknown recipe' });

  // Check inventory.
  const need = recipe.inputs;
  const have = {};
  const haveRows = await sql`SELECT item_key, quantity FROM inventory_items WHERE user_id = ${uid}`;
  for (const r of haveRows) have[r.item_key] = r.quantity;
  for (const [k, q] of Object.entries(need)) {
    if ((have[k] || 0) < q) return res.status(400).json({ error: `missing ${k}` });
  }
  // Consume inputs.
  for (const [k, q] of Object.entries(need)) {
    await sql`UPDATE inventory_items SET quantity = quantity - ${q}
              WHERE user_id = ${uid} AND item_key = ${k}`;
  }
  // Produce output.
  await sql`
    INSERT INTO inventory_items (user_id, item_key, quantity)
    VALUES (${uid}, ${recipe.output.key}, ${recipe.output.qty})
    ON CONFLICT (user_id, item_key) DO UPDATE
      SET quantity = inventory_items.quantity + EXCLUDED.quantity
  `;
  await sql`INSERT INTO crafted_items (user_id, item_key, data) VALUES (${uid}, ${recipe.output.key}, '{}'::jsonb)`;
  res.json({ ok: true, produced: recipe.output });
});

export default router;
