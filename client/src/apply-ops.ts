import type { DrawOp } from './types';
import { parseColor, stampCircle, drawLineSegment, floodFill, clearImageData, createBlankImageData, cloneImageData, CANVAS_WIDTH, CANVAS_HEIGHT } from './draw-util';

export type DrawState = {
  color: string;
  rgb: [number, number, number];
  size: number;
  radius: number;
  lastX: number;
  lastY: number;
  started: boolean;
};

// A snapshot is a full-buffer copy: 1.9 MB at 800x600. Bounding the stack by
// total bytes rather than by count keeps a small canvas's history deep and a
// large one's memory finite. The editor and the replay path both derive their
// cap from here, so an undo that the editor refused to perform is also one
// that replay refuses, and the two agree on what a card looks like.
const UNDO_BUDGET_BYTES = 24 * 1024 * 1024;

export function maxSnapshotsFor(w: number, h: number): number {
  return Math.max(2, Math.min(30, Math.floor(UNDO_BUDGET_BYTES / (w * h * 4))));
}

export function createDrawState(): DrawState {
  return { color: '#000000', rgb: [0, 0, 0], size: 5, radius: 2, lastX: 0, lastY: 0, started: false };
}

// Apply a single DrawOp to imageData in place. Mutates drawState.
// Returns true if a snapshot should be saved (stroke end, fill, clear).
export function applyOp(
  imageData: ImageData,
  op: DrawOp,
  drawState: DrawState,
  snapshots: ImageData[],
): boolean {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  switch (op.type) {
    case 'draw-start': {
      const rgb = parseColor(op.color);
      const radius = Math.max(0, op.size / 2 - 0.5);
      drawState.color = op.color;
      drawState.rgb = rgb;
      drawState.size = op.size;
      drawState.radius = radius;
      drawState.started = true;
      drawState.lastX = op.x;
      drawState.lastY = op.y;
      stampCircle(data, op.x, op.y, radius, rgb[0], rgb[1], rgb[2], w, h);
      return false;
    }
    case 'draw-move': {
      if (!drawState.started) return false;
      const [r, g, b] = drawState.rgb;
      for (const pt of op.points) {
        drawLineSegment(data, drawState.lastX, drawState.lastY, pt.x, pt.y, drawState.radius, r, g, b, w, h);
        drawState.lastX = pt.x;
        drawState.lastY = pt.y;
      }
      return false;
    }
    case 'draw-end':
      drawState.started = false;
      return true;
    case 'draw-fill':
      floodFill(data, op.x, op.y, op.color, w, h);
      return true;
    case 'draw-undo':
      // Undoing past the base of the stack does nothing, matching the
      // editor's refusal to undo when only the base snapshot remains.
      if (snapshots.length > 1) {
        snapshots.pop();
        const prev = snapshots[snapshots.length - 1];
        const src = prev.data;
        for (let i = 0; i < data.length; i++) data[i] = src[i];
      }
      return false;
    case 'draw-clear':
      // A clear is an undoable step like any other: the caller snapshots
      // it, and a following undo pops back to the pre-clear image.
      clearImageData(data);
      return true;
  }
}

// Replay all ops onto a fresh imageData, returning the final imageData and
// snapshots.
//
// Snapshots exist to serve `draw-undo`, and each one is a full-buffer copy
// taken at every stroke end. A caller that wants only the final image can
// pass `retainSnapshots: false` and skip them, except when the ops contain an
// undo, which needs the history to replay correctly.
export function replayOps(
  ops: DrawOp[],
  w = CANVAS_WIDTH,
  h = CANVAS_HEIGHT,
  { retainSnapshots = true }: { retainSnapshots?: boolean } = {},
): { imageData: ImageData; snapshots: ImageData[] } {
  const keepSnapshots = retainSnapshots || ops.some(op => op.type === 'draw-undo');
  const maxSnapshots = maxSnapshotsFor(w, h);
  const imageData = createBlankImageData(w, h);
  const snapshots: ImageData[] = keepSnapshots ? [cloneImageData(imageData)] : [];
  const drawState = createDrawState();
  for (const op of ops) {
    const shouldSnapshot = applyOp(imageData, op, drawState, snapshots);
    if (shouldSnapshot && keepSnapshots) {
      snapshots.push(cloneImageData(imageData));
      if (snapshots.length > maxSnapshots) snapshots.shift();
    }
  }
  return { imageData, snapshots };
}
