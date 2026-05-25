import { Router } from 'express';
import { sql } from '../db.js';
import {
  hashPassword, comparePassword, signToken,
  findUserByUsername, findUserByEmail, createUser, authMiddleware
} from '../auth.js';
import crypto from 'node:crypto';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, password required' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'password too short' });
    if (await findUserByUsername(username)) return res.status(409).json({ error: 'username taken' });
    if (await findUserByEmail(email)) return res.status(409).json({ error: 'email taken' });

    const passwordHash = await hashPassword(password);
    const user = await createUser({ username, email, passwordHash });
    const token = signToken({ uid: user.id, username: user.username });
    res.json({ token, user });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const user = await findUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = signToken({ uid: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  // Stateless JWT; client discards token. We accept the call for symmetry.
  res.json({ ok: true });
});

router.post('/password-reset/request', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = await findUserByEmail(email);
  if (!user) return res.json({ ok: true }); // do not leak existence
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await sql`UPDATE users SET reset_token = ${token}, reset_expires = ${expires} WHERE id = ${user.id}`;
  // In production, email this. Here we return it for the test flow.
  res.json({ ok: true, reset_token: token });
});

router.post('/password-reset/confirm', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  const rows = await sql`SELECT id FROM users WHERE reset_token = ${token} AND reset_expires > NOW() LIMIT 1`;
  const user = rows[0];
  if (!user) return res.status(400).json({ error: 'invalid or expired token' });
  const hash = await hashPassword(password);
  await sql`UPDATE users SET password_hash = ${hash}, reset_token = NULL, reset_expires = NULL WHERE id = ${user.id}`;
  res.json({ ok: true });
});

router.get('/me', authMiddleware, async (req, res) => {
  const rows = await sql`SELECT id, username, email FROM users WHERE id = ${req.user.uid} LIMIT 1`;
  res.json({ user: rows[0] || null });
});

export default router;
