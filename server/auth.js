import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sql } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '7d';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ error: 'invalid token' });
  req.user = claims;
  next();
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

export async function comparePassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

export async function findUserByUsername(username) {
  const rows = await sql`SELECT id, username, email, password_hash FROM users WHERE username = ${username} LIMIT 1`;
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  const rows = await sql`SELECT id, username, email, password_hash FROM users WHERE email = ${email} LIMIT 1`;
  return rows[0] || null;
}

export async function createUser({ username, email, passwordHash }) {
  const rows = await sql`
    INSERT INTO users (username, email, password_hash)
    VALUES (${username}, ${email}, ${passwordHash})
    RETURNING id, username, email
  `;
  // ensure character row
  await sql`INSERT INTO characters (user_id) VALUES (${rows[0].id}) ON CONFLICT DO NOTHING`;
  return rows[0];
}
