import { Point } from './types';
import { vadd, vscale } from './vutil';

// Number of 90° clockwise rotations: 0, 1, 2, or 3.
export type Rot = 0 | 1 | 2 | 3;

// A 2D similarity transform: rotate (by a multiple of 90°), then
// uniformly scale, then translate.
//
//   apply(t, p) = t.translate + t.scale * rot(t.rot, p)
//
// This is closed under composition and inversion.
export type SE2 = {
  rot: Rot;
  scale: number;
  translate: Point;
};

// Apply rotation by `r` quarter-turns clockwise.
// Negate, avoiding -0.
function neg(x: number): number {
  return x === 0 ? 0 : -x;
}

export function rotate(r: Rot, p: Point): Point {
  switch (r) {
    case 0: return { x: p.x, y: p.y };
    case 1: return { x: p.y, y: neg(p.x) };
    case 2: return { x: neg(p.x), y: neg(p.y) };
    case 3: return { x: neg(p.y), y: p.x };
  }
}

export function apply(t: SE2, p: Point): Point {
  return vadd(t.translate, vscale(rotate(t.rot, p), t.scale));
}

export function compose(a: SE2, b: SE2): SE2 {
  // a(b(p)) = a.t + a.s * rot_a(b.t + b.s * rot_b(p))
  //         = a.t + a.s * rot_a(b.t) + a.s * b.s * rot_{a+b}(p)
  return {
    rot: ((a.rot + b.rot) % 4) as Rot,
    scale: a.scale * b.scale,
    translate: vadd(a.translate, vscale(rotate(a.rot, b.translate), a.scale)),
  };
}

export function composen(...xforms: SE2[]): SE2 {
  return xforms.reduce(compose);
}

export function inverse(a: SE2): SE2 {
  // a(p) = a.t + a.s * rot_a(p) = y
  // p = (1/a.s) * rot_{-a}(y - a.t)
  //   = (1/a.s) * rot_{-a}(y) + (1/a.s) * rot_{-a}(-a.t)
  const invRot = ((4 - a.rot) % 4) as Rot;
  const invScale = 1 / a.scale;
  return {
    rot: invRot,
    scale: invScale,
    translate: vscale(rotate(invRot, a.translate), -invScale),
  };
}

export function ident(): SE2 {
  return { rot: 0, scale: 1, translate: { x: 0, y: 0 } };
}

export function mkTranslate(p: Point): SE2 {
  return { rot: 0, scale: 1, translate: p };
}

export function mkScale(s: number): SE2 {
  return { rot: 0, scale: s, translate: { x: 0, y: 0 } };
}

export function mkRotate(r: Rot): SE2 {
  return { rot: r, scale: 1, translate: { x: 0, y: 0 } };
}

export function mk(rot: Rot, scale: number, translate: Point): SE2 {
  return { rot, scale, translate };
}
