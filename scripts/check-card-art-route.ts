// Fetches a few cards' ops from a running bwc server and checks the response
// against the stored library. Run: npx tsx scripts/check-card-art-route.ts [port]
import fs from 'node:fs';
import path from 'node:path';
import { hashOps, normalizeOps, type DrawOp } from '../server/draw-ops.js';

const port = process.argv[2] ?? '3457';
const libPath = path.resolve(import.meta.dirname, '..', 'data', 'bwc', 'cards.json');
const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8')) as { cards: Record<string, { ops: DrawOp[] }> };

for (const [cardId, card] of Object.entries(lib.cards).slice(0, 3)) {
  const ops = normalizeOps(card.ops);
  const hash = hashOps(ops);
  const res = await fetch(`http://localhost:${port}/api/bwc/card/${cardId}/${hash}`);
  const body = (await res.json()) as { ops?: DrawOp[] };
  const match = JSON.stringify(body.ops) === JSON.stringify(ops);
  console.log(
    `${cardId.slice(0, 8)} hash=${hash} status=${res.status} ` +
    `cache="${res.headers.get('cache-control')}" ops=${body.ops?.length} match=${match}`,
  );
}

const miss = await fetch(`http://localhost:${port}/api/bwc/card/nope/nohash`);
console.log(`unknown hash: status=${miss.status} cache="${miss.headers.get('cache-control')}"`);
