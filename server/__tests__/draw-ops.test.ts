// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizeOps, hashOps, type DrawOp } from '../draw-ops.js';

describe('normalizeOps', () => {
  it('rounds coordinates on starts, moves, and fills', () => {
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 12.7, y: 3.2 },
      { type: 'draw-move', points: [{ x: 20.4, y: 8.9 }] },
      { type: 'draw-end' },
      { type: 'draw-fill', x: 4.6, y: 9.1, color: '#ff0000' },
    ];
    expect(normalizeOps(ops)).toEqual([
      { type: 'draw-start', color: '#000000', size: 5, x: 13, y: 3 },
      { type: 'draw-move', points: [{ x: 20, y: 9 }] },
      { type: 'draw-end' },
      { type: 'draw-fill', x: 5, y: 9, color: '#ff0000' },
    ]);
  });

  it('drops points that repeat the previous point', () => {
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 1, y: 1 },
      { type: 'draw-move', points: [{ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 3 }] },
      { type: 'draw-end' },
    ];
    const [, move] = normalizeOps(ops);
    expect(move).toEqual({ type: 'draw-move', points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] });
  });

  it('drops a point that repeats the stroke start', () => {
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 4, y: 4 },
      { type: 'draw-move', points: [{ x: 4, y: 4 }, { x: 5, y: 5 }] },
      { type: 'draw-end' },
    ];
    const [, move] = normalizeOps(ops);
    expect(move).toEqual({ type: 'draw-move', points: [{ x: 5, y: 5 }] });
  });

  it('drops a point that repeats the end of the previous batch', () => {
    // The editor flushes buffered points on an interval, so a held pointer
    // produces the same coordinate at the end of one batch and the start
    // of the next.
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 1, y: 1 },
      { type: 'draw-move', points: [{ x: 6, y: 6 }] },
      { type: 'draw-move', points: [{ x: 6, y: 6 }, { x: 7, y: 7 }] },
      { type: 'draw-end' },
    ];
    expect(normalizeOps(ops)).toEqual([
      { type: 'draw-start', color: '#000000', size: 5, x: 1, y: 1 },
      { type: 'draw-move', points: [{ x: 6, y: 6 }] },
      { type: 'draw-move', points: [{ x: 7, y: 7 }] },
      { type: 'draw-end' },
    ]);
  });

  it('removes a move op left with no points', () => {
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 2, y: 2 },
      { type: 'draw-move', points: [{ x: 2.2, y: 2.1 }] },
      { type: 'draw-end' },
    ];
    expect(normalizeOps(ops).map(o => o.type)).toEqual(['draw-start', 'draw-end']);
  });

  it('does not carry the previous stroke position into a new stroke', () => {
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 3, y: 3 },
      { type: 'draw-move', points: [{ x: 9, y: 9 }] },
      { type: 'draw-end' },
      { type: 'draw-start', color: '#000000', size: 5, x: 9, y: 9 },
      { type: 'draw-move', points: [{ x: 9, y: 9 }, { x: 10, y: 10 }] },
      { type: 'draw-end' },
    ];
    const out = normalizeOps(ops);
    // The second stroke's start stays, and only the point repeating it goes.
    expect(out[3]).toEqual({ type: 'draw-start', color: '#000000', size: 5, x: 9, y: 9 });
    expect(out[4]).toEqual({ type: 'draw-move', points: [{ x: 10, y: 10 }] });
  });

  it('preserves the sequence of distinct pixels', () => {
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 0, y: 0 },
      { type: 'draw-move', points: [{ x: 1.1, y: 0 }, { x: 1.4, y: 0.2 }, { x: 2, y: 0 }, { x: 1, y: 0 }] },
      { type: 'draw-end' },
    ];
    const [, move] = normalizeOps(ops);
    // The revisit of (1,0) after (2,0) is a real move and stays.
    expect(move).toEqual({ type: 'draw-move', points: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }] });
  });

  it('leaves undo and clear alone', () => {
    const ops: DrawOp[] = [{ type: 'draw-clear' }, { type: 'draw-undo' }];
    expect(normalizeOps(ops)).toEqual(ops);
  });

  it('is idempotent', () => {
    const ops: DrawOp[] = [
      { type: 'draw-start', color: '#000000', size: 5, x: 1.6, y: 1.4 },
      { type: 'draw-move', points: [{ x: 2, y: 1 }, { x: 2.2, y: 1.1 }, { x: 5, y: 5 }] },
      { type: 'draw-end' },
    ];
    const once = normalizeOps(ops);
    expect(normalizeOps(once)).toEqual(once);
    expect(hashOps(normalizeOps(once))).toBe(hashOps(once));
  });
});
