export type DrawStartOp = { type: 'draw-start'; color: string; size: number; x: number; y: number; t?: number };
export type DrawMoveOp = { type: 'draw-move'; points: Array<{ x: number; y: number }>; t?: number };
export type DrawEndOp = { type: 'draw-end'; t?: number };
export type DrawFillOp = { type: 'draw-fill'; x: number; y: number; color: string; t?: number };
export type DrawUndoOp = { type: 'draw-undo'; t?: number };
export type DrawClearOp = { type: 'draw-clear'; t?: number };
export type DrawOp = DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp;

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
