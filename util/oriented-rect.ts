import type { Point } from './types';
import { SE2, apply } from './se2';

// An axis-aligned rectangle that has been rotated and scaled around its center.
export type OrientedRect = {
  center: Point;
  halfSize: Point;  // half-width, half-height in LOGICAL (unscaled) units
  scale: number;    // uniform scale factor (visual size = halfSize * scale)
  rotDeg: number;   // rotation in degrees
};

// Transform an oriented rect through an SE2.
// - Center is transformed by the SE2.
// - Scale is accumulated (not applied to halfSize).
// - Rotation is accumulated (SE2.rot * 90° + rect.rotDeg).
export function transformRect(se2: SE2, rect: OrientedRect): OrientedRect {
  return {
    center: apply(se2, rect.center),
    halfSize: rect.halfSize,
    scale: rect.scale * se2.scale,
    rotDeg: rect.rotDeg + se2.rot * 90,
  };
}

// Derive CSS positioning from a screen-space oriented rect.
// Width and height are set to the LOGICAL dimensions; visual scaling
// is handled by a CSS scale() transform so that container-query units
// (cqw) inside the element are stable regardless of zoom level.
export function orientedRectToStyle(rect: OrientedRect): React.CSSProperties {
  return {
    left: rect.center.x,
    top: rect.center.y,
    width: rect.halfSize.x * 2,
    height: rect.halfSize.y * 2,
    transform: `translate(-50%, -50%) rotate(${rect.rotDeg}deg) scale(${rect.scale})`,
  };
}
