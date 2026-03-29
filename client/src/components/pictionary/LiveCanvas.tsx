import { useRef, useEffect, useCallback } from 'react';
import type { DrawOp } from '../../types';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 450;

type LiveCanvasProps = {
  ops: DrawOp[];
};

export function LiveCanvas({ ops }: LiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appliedRef = useRef(0);
  const snapshotsRef = useRef<ImageData[]>([]);
  const drawStateRef = useRef({ color: '#000000', size: 5, started: false });

  const getCtx = useCallback(() => {
    return canvasRef.current?.getContext('2d') ?? null;
  }, []);

  function saveSnapshot() {
    const ctx = getCtx();
    if (!ctx) return;
    snapshotsRef.current.push(ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));
    if (snapshotsRef.current.length > 30) snapshotsRef.current.shift();
  }

  function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string) {
    const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imageData.data;

    const tmp = document.createElement('canvas').getContext('2d')!;
    tmp.fillStyle = fillColor;
    tmp.fillRect(0, 0, 1, 1);
    const [fr, fg, fb] = tmp.getImageData(0, 0, 1, 1).data;

    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    if (sx < 0 || sx >= CANVAS_WIDTH || sy < 0 || sy >= CANVAS_HEIGHT) return;

    const idx = (sy * CANVAS_WIDTH + sx) * 4;
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];

    if (tr === fr && tg === fg && tb === fb && ta === 255) return;

    const tolerance = 32;
    function matches(i: number) {
      return Math.abs(data[i] - tr) <= tolerance &&
        Math.abs(data[i + 1] - tg) <= tolerance &&
        Math.abs(data[i + 2] - tb) <= tolerance &&
        Math.abs(data[i + 3] - ta) <= tolerance;
    }

    const stack = [sx, sy];
    const visited = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);

    while (stack.length > 0) {
      const cy = stack.pop()!;
      const cx = stack.pop()!;
      const pi = cy * CANVAS_WIDTH + cx;
      if (visited[pi]) continue;
      visited[pi] = 1;

      const di = pi * 4;
      if (!matches(di)) continue;

      data[di] = fr;
      data[di + 1] = fg;
      data[di + 2] = fb;
      data[di + 3] = 255;

      if (cx > 0) stack.push(cx - 1, cy);
      if (cx < CANVAS_WIDTH - 1) stack.push(cx + 1, cy);
      if (cy > 0) stack.push(cx, cy - 1);
      if (cy < CANVAS_HEIGHT - 1) stack.push(cx, cy + 1);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function applyOp(op: DrawOp) {
    const ctx = getCtx();
    if (!ctx) return;
    const ds = drawStateRef.current;

    switch (op.type) {
      case 'draw-start':
        ds.color = op.color;
        ds.size = op.size;
        ds.started = true;
        ctx.beginPath();
        ctx.moveTo(op.x, op.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.size;
        ctx.lineTo(op.x, op.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(op.x, op.y);
        break;
      case 'draw-move':
        if (!ds.started) break;
        ctx.strokeStyle = ds.color;
        ctx.lineWidth = ds.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const pt of op.points) {
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        if (op.points.length > 0) {
          const last = op.points[op.points.length - 1];
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
        }
        break;
      case 'draw-end':
        ds.started = false;
        saveSnapshot();
        break;
      case 'draw-fill':
        floodFill(ctx, op.x, op.y, op.color);
        saveSnapshot();
        break;
      case 'draw-undo':
        if (snapshotsRef.current.length > 1) {
          snapshotsRef.current.pop();
          ctx.putImageData(snapshotsRef.current[snapshotsRef.current.length - 1], 0, 0);
        } else {
          snapshotsRef.current = [];
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        break;
      case 'draw-clear':
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        snapshotsRef.current = [];
        saveSnapshot();
        break;
    }
  }

  // Initialize canvas
  useEffect(() => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    saveSnapshot();
    // Apply any ops that were provided at mount time
    while (appliedRef.current < ops.length) {
      applyOp(ops[appliedRef.current]);
      appliedRef.current++;
    }
  }, []);

  // Apply new ops incrementally
  useEffect(() => {
    while (appliedRef.current < ops.length) {
      applyOp(ops[appliedRef.current]);
      appliedRef.current++;
    }
  }, [ops.length]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="live-canvas"
    />
  );
}
