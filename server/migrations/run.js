import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn('[migrate] DATABASE_URL not set, skipping migrations.');
    return;
  }
  const files = readdirSync(__dirname).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sqlText = readFileSync(join(__dirname, f), 'utf8');
    console.log(`[migrate] applying ${f}`);
    const statements = sqlText.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await sql(stmt);
      } catch (err) {
        console.error(`[migrate] failed on statement in ${f}:`, err.message);
        throw err;
      }
    }
  }
  console.log('[migrate] done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
