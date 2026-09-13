import { describe, it, expect } from 'vitest';
import { installCanvasStubs } from './canvas-stub';

installCanvasStubs();

import type { DrawOp } from '../types';
import { replayOps } from '../apply-ops';
import {
  parseColor, stampCircle, drawLineSegment, floodFill,
  clearImageData, createBlankImageData, cloneImageData,
} from '../draw-util';

const W = 16;
const H = 12;
const UNDO_LIMIT = 30;

type Point = { x: number; y: number };

// A stand-in for DrawingCanvas's local state: the pixels it shows, the undo
// stack it keeps, and the ops it emits. Every gesture below mirrors the
// corresponding handler so that a divergence between what an author sees and
// what `replayOps` produces for everyone else shows up as a test failure.
type EditorSim = {
  imageData: ImageData;
  undoStack: ImageData[];
  ops: DrawOp[];
};

function saveSnapshot(sim: EditorSim): void {
  sim.undoStack.push(cloneImageData(sim.imageData));
  if (sim.undoStack.length > UNDO_LIMIT) sim.undoStack.shift();
}

function createEditorSim(): EditorSim {
  const sim: EditorSim = { imageData: createBlankImageData(W, H), undoStack: [], ops: [] };
  saveSnapshot(sim);
  return sim;
}

function simStroke(sim: EditorSim, color: string, size: number, points: Point[]): void {
  const [r, g, b] = parseColor(color);
  const radius = Math.max(0, size / 2 - 0.5);
  const [first, ...rest] = points;

  stampCircle(sim.imageData.data, first.x, first.y, radius, r, g, b, W, H);
  sim.ops.push({ type: 'draw-start', color, size, x: first.x, y: first.y });

  let last = first;
  for (const pt of rest) {
    drawLineSegment(sim.imageData.data, last.x, last.y, pt.x, pt.y, radius, r, g, b, W, H);
    last = pt;
  }
  if (rest.length > 0) sim.ops.push({ type: 'draw-move', points: rest });

  saveSnapshot(sim);
  sim.ops.push({ type: 'draw-end' });
}

function simFill(sim: EditorSim, x: number, y: number, color: string): void {
  floodFill(sim.imageData.data, x, y, color, W, H);
  saveSnapshot(sim);
  sim.ops.push({ type: 'draw-fill', x, y, color });
}

function simClear(sim: EditorSim): void {
  clearImageData(sim.imageData.data);
  saveSnapshot(sim);
  sim.ops.push({ type: 'draw-clear' });
}

function simUndo(sim: EditorSim): void {
  if (sim.undoStack.length <= 1) return;
  sim.undoStack.pop();
  sim.imageData = cloneImageData(sim.undoStack[sim.undoStack.length - 1]);
  sim.ops.push({ type: 'draw-undo' });
}

function describePixel(data: Uint8ClampedArray, i: number): string {
  const px = i - (i % 4);
  return `(${px / 4 % W},${Math.floor(px / 4 / W)}) rgba(${data[px]},${data[px + 1]},${data[px + 2]},${data[px + 3]})`;
}

// Assert that replaying the emitted ops reproduces what the editor shows.
function expectReplayMatchesEditor(sim: EditorSim): void {
  const replayed = replayOps(sim.ops, W, H).imageData;
  const expected = sim.imageData.data;
  for (let i = 0; i < expected.length; i++) {
    if (replayed.data[i] !== expected[i]) {
      throw new Error(
        `replay diverges from the editor at pixel ${describePixel(replayed.data, i)}, ` +
        `editor has ${describePixel(expected, i)}. ops: ${sim.ops.map(o => o.type).join(', ')}`,
      );
    }
  }
  expect(replayed.width).toBe(W);
  expect(replayed.height).toBe(H);
}

function isBlank(imageData: ImageData): boolean {
  return imageData.data.every(v => v === 255);
}

const STROKE_A: Point[] = [{ x: 2, y: 2 }, { x: 6, y: 2 }];
const STROKE_B: Point[] = [{ x: 3, y: 8 }, { x: 9, y: 8 }];

describe('replayOps reproduces what the editor shows', () => {
  it('a single stroke', () => {
    const sim = createEditorSim();
    simStroke(sim, '#e74c3c', 5, STROKE_A);
    expectReplayMatchesEditor(sim);
  });

  it('undo of a stroke', () => {
    const sim = createEditorSim();
    simStroke(sim, '#000000', 5, STROKE_A);
    simStroke(sim, '#3498db', 2, STROKE_B);
    simUndo(sim);
    expectReplayMatchesEditor(sim);
  });

  it('clear then undo restores the pre-clear drawing', () => {
    const sim = createEditorSim();
    simStroke(sim, '#000000', 5, STROKE_A);
    simClear(sim);
    simUndo(sim);
    expectReplayMatchesEditor(sim);
    expect(isBlank(sim.imageData)).toBe(false);
  });

  it('clear, undo, then more drawing keeps both strokes', () => {
    const sim = createEditorSim();
    simStroke(sim, '#000000', 5, STROKE_A);
    simClear(sim);
    simUndo(sim);
    simStroke(sim, '#2ecc71', 5, STROKE_B);
    expectReplayMatchesEditor(sim);
  });

  it('clear without undo really does clear', () => {
    const sim = createEditorSim();
    simStroke(sim, '#000000', 5, STROKE_A);
    simClear(sim);
    expectReplayMatchesEditor(sim);
    expect(isBlank(sim.imageData)).toBe(true);
  });

  it('fill, clear, undo', () => {
    const sim = createEditorSim();
    simFill(sim, 4, 4, '#f1c40f');
    simClear(sim);
    simUndo(sim);
    expectReplayMatchesEditor(sim);
    expect(isBlank(sim.imageData)).toBe(false);
  });

  it('repeated undo walks back through clears and strokes', () => {
    const sim = createEditorSim();
    simStroke(sim, '#000000', 5, STROKE_A);
    simStroke(sim, '#9b59b6', 5, STROKE_B);
    simClear(sim);
    simUndo(sim);
    simUndo(sim);
    simUndo(sim);
    expectReplayMatchesEditor(sim);
    expect(isBlank(sim.imageData)).toBe(true);
  });

  it('undo past the start of the session is ignored by the editor', () => {
    const sim = createEditorSim();
    simUndo(sim);
    simUndo(sim);
    expect(sim.ops).toEqual([]);
    expectReplayMatchesEditor(sim);
  });
});

describe('replayOps on hand-built op sequences', () => {
  it('treats an undo with nothing to revert as a no-op', () => {
    // Not reachable from the editor, which emits no op in this case, but
    // replay must not respond by wiping the canvas.
    const drawn = replayOps([
      { type: 'draw-start', color: '#000000', size: 5, x: 2, y: 2 },
      { type: 'draw-move', points: [{ x: 8, y: 6 }] },
    ], W, H);
    const undone = replayOps([
      { type: 'draw-start', color: '#000000', size: 5, x: 2, y: 2 },
      { type: 'draw-move', points: [{ x: 8, y: 6 }] },
      { type: 'draw-undo' },
    ], W, H);
    expect(isBlank(drawn.imageData)).toBe(false);
    expect(Array.from(undone.imageData.data)).toEqual(Array.from(drawn.imageData.data));
  });

  it('leaves an undo-only sequence blank', () => {
    const { imageData } = replayOps([{ type: 'draw-undo' }], W, H);
    expect(isBlank(imageData)).toBe(true);
  });
});
