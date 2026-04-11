import { apply, SE2 } from './se2';
import { Point, Rect } from './types';
import { vsub, vscale } from './vutil';

export function applyToRect(t: SE2, r: Rect): Rect {
  return {
    p: apply(t, r.p),
    sz: vscale(r.sz, t.scale),
  };
}

// Find a transform u such that u(p0) = p1, and u has the same rot and
// scale as t (i.e. they only differ in translation).
export function matchScale(t: SE2, p0: Point, p1: Point): SE2 {
  return {
    rot: t.rot,
    scale: t.scale,
    translate: vsub(p1, apply({ ...t, translate: { x: 0, y: 0 } }, p0)),
  };
}
