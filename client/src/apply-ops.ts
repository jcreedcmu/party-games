import type { DrawOp } from './types';
import { parseColor, stampCircle, drawLineSegment, floodFill, clearImageData, createBlankImageData, cloneImageData } from './draw-util';

export type DrawState = {
  color: string;
  rgb: [number, number, number];
  size: number;
  radius: number;
  lastX: number;
  lastY: number;
  started: boolean;
};

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
      stampCircle(data, op.x, op.y, radius, rgb[0], rgb[1], rgb[2]);
      return false;
    }
    case 'draw-move': {
      if (!drawState.started) return false;
      const [r, g, b] = drawState.rgb;
      for (const pt of op.points) {
        drawLineSegment(data, drawState.lastX, drawState.lastY, pt.x, pt.y, drawState.radius, r, g, b);
        drawState.lastX = pt.x;
        drawState.lastY = pt.y;
      }
      return false;
    }
    case 'draw-end':
      drawState.started = false;
      return true;
    case 'draw-fill':
      floodFill(data, op.x, op.y, op.color);
      return true;
    case 'draw-undo':
      if (snapshots.length > 1) {
        snapshots.pop();
        const prev = snapshots[snapshots.length - 1];
        const src = prev.data;
        for (let i = 0; i < data.length; i++) data[i] = src[i];
      } else {
        snapshots.length = 0;
        clearImageData(data);
      }
      return false;
    case 'draw-clear':
      clearImageData(data);
      snapshots.length = 0;
      return true;
  }
}

// Replay all ops onto a fresh imageData, returning the final imageData and snapshots.
export function replayOps(ops: DrawOp[]): { imageData: ImageData; snapshots: ImageData[] } {
  const imageData = createBlankImageData();
  const snapshots: ImageData[] = [cloneImageData(imageData)];
  const drawState = createDrawState();
  for (const op of ops) {
    const shouldSnapshot = applyOp(imageData, op, drawState, snapshots);
    if (shouldSnapshot) {
      snapshots.push(cloneImageData(imageData));
      if (snapshots.length > 30) snapshots.shift();
    }
  }
  return { imageData, snapshots };
}
