export type DrawStartOp = { type: 'draw-start'; color: string; size: number; x: number; y: number };
export type DrawMoveOp = { type: 'draw-move'; points: Array<{ x: number; y: number }> };
export type DrawEndOp = { type: 'draw-end' };
export type DrawFillOp = { type: 'draw-fill'; x: number; y: number; color: string };
export type DrawUndoOp = { type: 'draw-undo' };
export type DrawClearOp = { type: 'draw-clear' };
export type DrawOp = DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp;
