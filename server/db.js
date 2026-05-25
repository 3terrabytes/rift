import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set. Server will start but DB queries will fail.');
}

export const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : async () => { throw new Error('DATABASE_URL is not configured'); };

export async function query(text, params = []) {
  return sql(text, params);
}
