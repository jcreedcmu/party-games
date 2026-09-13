// Reports what the card library costs on disk and on the wire, before and
// after normalization, using the same code paths the server uses.
//
//   npx tsx scripts/measure-library.ts

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  configureLibrary, formatLibrary, persistLibrary, flushLibrary,
  type SerializedLibrary,
} from '../server/games/bwc/storage.js';

const libraryPath = path.resolve(import.meta.dirname, '..', 'data', 'bwc', 'cards.json');
const raw = fs.readFileSync(libraryPath, 'utf-8');
const before: SerializedLibrary = JSON.parse(raw);

let after: SerializedLibrary | null = null;
const library = configureLibrary(before, data => { after = data; });
persistLibrary(library);
flushLibrary();
if (!after) throw new Error('library was never persisted');

function kb(n: number): string {
  return (n / 1024).toFixed(0).padStart(7) + ' KB';
}

const formatted = formatLibrary(after);
const wireBefore = JSON.stringify(Object.values(before.cards).map(c => c.ops));
const wireAfter = JSON.stringify(Object.values(after.cards).map(c => c.ops));

console.log(`cards: ${library.size}`);
console.log();
console.log('on disk');
console.log(`  current file          ${kb(Buffer.byteLength(raw))}`);
console.log(`  normalized, one line per card ${kb(Buffer.byteLength(formatted))}`);
console.log();
console.log('ops payload');
console.log(`  before                ${kb(Buffer.byteLength(wireBefore))}`);
console.log(`  after normalize       ${kb(Buffer.byteLength(wireAfter))}`);
console.log(`  after normalize, deflated ${kb(zlib.deflateRawSync(wireAfter).length)}`);
console.log();

const pointsOf = (data: SerializedLibrary) =>
  Object.values(data.cards).flatMap(c => c.ops as Array<{ type: string; points?: unknown[] }>)
    .filter(op => op.type === 'draw-move')
    .reduce((n, op) => n + (op.points?.length ?? 0), 0);
console.log(`points: ${pointsOf(before)} -> ${pointsOf(after)}`);
