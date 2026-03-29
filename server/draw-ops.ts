export type DrawStartOp = { type: 'draw-start'; color: string; size: number; x: number; y: number; t?: number };
export type DrawMoveOp = { type: 'draw-move'; points: Array<{ x: number; y: number }>; t?: number };
export type DrawEndOp = { type: 'draw-end'; t?: number };
export type DrawFillOp = { type: 'draw-fill'; x: number; y: number; color: string; t?: number };
export type DrawUndoOp = { type: 'draw-undo'; t?: number };
export type DrawClearOp = { type: 'draw-clear'; t?: number };
export type DrawOp = DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp;
