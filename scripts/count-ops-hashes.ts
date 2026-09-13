// How many distinct ops hashes the stored library has. Cards that share art
// (blanks, duplicates) share a hash and therefore one render.
import fs from 'node:fs';
import path from 'node:path';
import { hashOps, normalizeOps, type DrawOp } from '../server/draw-ops.js';

const libPath = path.resolve(import.meta.dirname, '..', 'data', 'bwc', 'cards.json');
const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8')) as { cards: Record<string, { ops: DrawOp[] }> };
const hashes = Object.values(lib.cards).map(c => hashOps(normalizeOps(c.ops)));
const counts = new Map<string, number>();
for (const h of hashes) counts.set(h, (counts.get(h) ?? 0) + 1);
console.log(`${hashes.length} cards, ${counts.size} distinct ops hashes`);
for (const [h, n] of counts) if (n > 1) console.log(`  ${h} shared by ${n} cards`);
