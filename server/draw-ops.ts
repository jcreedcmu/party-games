export type DrawStartOp = { type: 'draw-start'; color: string; size: number; x: number; y: number; t?: number };
export type DrawMoveOp = { type: 'draw-move'; points: Array<{ x: number; y: number }>; t?: number };
export type DrawEndOp = { type: 'draw-end'; t?: number };
export type DrawFillOp = { type: 'draw-fill'; x: number; y: number; color: string; t?: number };
export type DrawUndoOp = { type: 'draw-undo'; t?: number };
export type DrawClearOp = { type: 'draw-clear'; t?: number };
export type DrawOp = DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp;

// Card art is rendered at integer pixel coordinates, and a pointer sample
// landing on the pixel its predecessor already covered draws nothing. Both
// kinds of detail survive in the ops as recorded, so normalizing on the way
// in shrinks stored art without changing what it renders as.
export function normalizeOps(ops: DrawOp[]): DrawOp[] {
  const out: DrawOp[] = [];
  // The last pixel covered in the current stroke, or null between strokes.
  let last: { x: number; y: number } | null = null;

  for (const op of ops) {
    switch (op.type) {
      case 'draw-start': {
        const x = Math.round(op.x);
        const y = Math.round(op.y);
        last = { x, y };
        out.push({ ...op, x, y });
        break;
      }
      case 'draw-move': {
        const points: Array<{ x: number; y: number }> = [];
        for (const p of op.points) {
          const x = Math.round(p.x);
          const y = Math.round(p.y);
          if (last && last.x === x && last.y === y) continue;
          last = { x, y };
          points.push({ x, y });
        }
        if (points.length > 0) out.push({ ...op, points });
        break;
      }
      case 'draw-fill': {
        last = null;
        out.push({ ...op, x: Math.round(op.x), y: Math.round(op.y) });
        break;
      }
      default:
        last = null;
        out.push(op);
    }
  }
  return out;
}

// Simple djb2 hash — not cryptographic, just fast and collision-resistant
// enough for cache keying.
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export function hashOps(ops: DrawOp[]): string {
  return hashString(JSON.stringify(ops));
}
