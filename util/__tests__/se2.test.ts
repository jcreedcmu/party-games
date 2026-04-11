import { describe, test, expect } from 'vitest';
import { SE2, apply, compose, composen, inverse, ident, mkTranslate, mkScale, mkRotate, mk, rotate } from '../se2';
import type { Point } from '../types';

const p: Point = { x: 10, y: 20 };

describe('rotate', () => {
  test('0° is identity', () => {
    expect(rotate(0, p)).toEqual({ x: 10, y: 20 });
  });
  test('90° CW', () => {
    expect(rotate(1, { x: 1, y: 0 })).toEqual({ x: 0, y: -1 });
    expect(rotate(1, { x: 0, y: 1 })).toEqual({ x: 1, y: 0 });
  });
  test('180°', () => {
    expect(rotate(2, p)).toEqual({ x: -10, y: -20 });
  });
  test('270° CW = 90° CCW', () => {
    expect(rotate(3, { x: 1, y: 0 })).toEqual({ x: 0, y: 1 });
  });
  test('four 90° rotations = identity', () => {
    let q = p;
    for (let i = 0; i < 4; i++) q = rotate(1, q);
    expect(q).toEqual(p);
  });
});

describe('apply', () => {
  test('identity', () => {
    expect(apply(ident(), p)).toEqual(p);
  });
  test('translation only', () => {
    expect(apply(mkTranslate({ x: 5, y: -3 }), p)).toEqual({ x: 15, y: 17 });
  });
  test('scale only', () => {
    expect(apply(mkScale(2), p)).toEqual({ x: 20, y: 40 });
  });
  test('rotation only', () => {
    expect(apply(mkRotate(1), { x: 1, y: 0 })).toEqual({ x: 0, y: -1 });
  });
  test('rotation + scale + translate', () => {
    // rot90(10,20) = (20,-10), *2 = (40,-20), +5,+3 = (45,-17)
    const t = mk(1, 2, { x: 5, y: 3 });
    expect(apply(t, p)).toEqual({ x: 45, y: -17 });
  });
});

describe('compose', () => {
  const xforms: SE2[] = [
    mkTranslate({ x: 3, y: -7 }),
    mkScale(2),
    mkRotate(1),
    mk(2, 0.5, { x: 10, y: 20 }),
    mk(3, 3, { x: -1, y: 5 }),
  ];

  test('compose satisfies a(b(p)) = compose(a,b)(p)', () => {
    for (const a of xforms) {
      for (const b of xforms) {
        const direct = apply(a, apply(b, p));
        const composed = apply(compose(a, b), p);
        expect(composed.x).toBeCloseTo(direct.x, 10);
        expect(composed.y).toBeCloseTo(direct.y, 10);
      }
    }
  });

  test('composen is left-to-right composition', () => {
    const [a, b, c] = xforms;
    const result = apply(composen(a, b, c), p);
    const direct = apply(a, apply(b, apply(c, p)));
    expect(result.x).toBeCloseTo(direct.x, 10);
    expect(result.y).toBeCloseTo(direct.y, 10);
  });
});

describe('inverse', () => {
  const xforms: SE2[] = [
    mkTranslate({ x: 3, y: -7 }),
    mkScale(2),
    mkRotate(1),
    mk(2, 0.5, { x: 10, y: 20 }),
    mk(3, 3, { x: -1, y: 5 }),
  ];

  test('compose(t, inverse(t)) ≈ identity', () => {
    for (const t of xforms) {
      const result = apply(compose(t, inverse(t)), p);
      expect(result.x).toBeCloseTo(p.x, 10);
      expect(result.y).toBeCloseTo(p.y, 10);
    }
  });

  test('compose(inverse(t), t) ≈ identity', () => {
    for (const t of xforms) {
      const result = apply(compose(inverse(t), t), p);
      expect(result.x).toBeCloseTo(p.x, 10);
      expect(result.y).toBeCloseTo(p.y, 10);
    }
  });
});
