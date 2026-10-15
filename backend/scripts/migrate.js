import { readFileSync } from 'node:fs';
import { pool } from '../src/lib/db.js';

const sql = readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema applied.');
await pool.end();
