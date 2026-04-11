import type { Point } from './types';
import { SE2, apply } from './se2';

// An axis-aligned rectangle that has been rotated around its center.
export type OrientedRect = {
  center: Point;
  halfSize: Point;  // half-width, half-height (in the rect's local frame)
  rotDeg: number;   // rotation in degrees
};

// Transform an oriented rect through an SE2.
// - Center is transformed by the SE2.
// - Half-size is scaled uniformly.
// - Rotation is accumulated (SE2.rot * 90° + rect.rotDeg).
export function transformRect(se2: SE2, rect: OrientedRect): OrientedRect {
  return {
    center: apply(se2, rect.center),
    halfSize: { x: rect.halfSize.x * se2.scale, y: rect.halfSize.y * se2.scale },
    rotDeg: rect.rotDeg + se2.rot * 90,
  };
}

// Derive CSS positioning from a screen-space oriented rect.
// Both width and height are set explicitly so the element's dimensions
// are deterministic and match the AABB used for bounds clamping.
export function orientedRectToStyle(rect: OrientedRect): React.CSSProperties {
  return {
    left: rect.center.x,
    top: rect.center.y,
    width: rect.halfSize.x * 2,
    height: rect.halfSize.y * 2,
    transform: `translate(-50%, -50%) rotate(${rect.rotDeg}deg)`,
  };
}
