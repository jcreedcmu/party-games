// Times card-art replay over the stored library, with and without undo
// snapshots. Run: npx tsx scripts/measure-replay.ts
import fs from 'node:fs';
import path from 'node:path';

class NodeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = 'srgb';
  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height ?? 1;
    }
  }
}
(globalThis as unknown as { ImageData: unknown }).ImageData = NodeImageData;

const { replayOps } = await import('../client/src/apply-ops.js');
type Ops = Parameters<typeof replayOps>[0];

const libPath = path.resolve(import.meta.dirname, '..', 'data', 'bwc', 'cards.json');
const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8')) as { cards: Record<string, { ops: Ops }> };
const cards = Object.values(lib.cards);
const withUndo = cards.filter(c => c.ops.some(op => op.type === 'draw-undo')).length;

function total(retainSnapshots: boolean): number {
  const t0 = performance.now();
  for (const card of cards) replayOps(card.ops, 800, 600, { retainSnapshots });
  return performance.now() - t0;
}

total(true); // warm up
console.log(`${cards.length} cards, ${withUndo} containing an undo`);
console.log(`retaining snapshots:  ${total(true).toFixed(0)} ms`);
console.log(`skipping snapshots:   ${total(false).toFixed(0)} ms`);
