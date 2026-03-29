import { useRef, useEffect, useCallback } from 'react';
import type { DrawOp } from '../../types';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  parseColor, stampCircle, drawLineSegment, floodFill,
  clearImageData, createBlankImageData, cloneImageData,
} from '../../draw-util';

const PLAYBACK_DURATION_MS = 5000;
const HOLD_DURATION_MS = 3000;

type LiveCanvasProps = {
  ops: DrawOp[];
  animated?: boolean;
  playing?: boolean;
};

export function LiveCanvas({ ops, animated = false, playing = false }: LiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appliedRef = useRef(0);
  const snapshotsRef = useRef<ImageData[]>([]);
  const imageDataRef = useRef<ImageData>(createBlankImageData());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawStateRef = useRef<{
    color: string;
    rgb: [number, number, number];
    size: number;
    radius: number;
    lastX: number;
    lastY: number;
    started: boolean;
  }>({ color: '#000000', rgb: [0, 0, 0], size: 5, radius: 2, lastX: 0, lastY: 0, started: false });

  const hasTimestamps = animated && ops.length > 0 && ops[0].t != null;

  const getCtx = useCallback(() => {
    return canvasRef.current?.getContext('2d') ?? null;
  }, []);

  function putImage() {
    const ctx = getCtx();
    if (ctx) ctx.putImageData(imageDataRef.current, 0, 0);
  }

  function saveSnapshot() {
    snapshotsRef.current.push(cloneImageData(imageDataRef.current));
    if (snapshotsRef.current.length > 30) snapshotsRef.current.shift();
  }

  function applyOp(op: DrawOp) {
    const ds = drawStateRef.current;
    const data = imageDataRef.current.data;

    switch (op.type) {
      case 'draw-start': {
        const rgb = parseColor(op.color);
        const radius = Math.max(0, op.size / 2 - 0.5);
        ds.color = op.color;
        ds.rgb = rgb;
        ds.size = op.size;
        ds.radius = radius;
        ds.started = true;
        ds.lastX = op.x;
        ds.lastY = op.y;
        stampCircle(data, op.x, op.y, radius, rgb[0], rgb[1], rgb[2]);
        break;
      }
      case 'draw-move': {
        if (!ds.started) break;
        const [r, g, b] = ds.rgb;
        for (const pt of op.points) {
          drawLineSegment(data, ds.lastX, ds.lastY, pt.x, pt.y, ds.radius, r, g, b);
          ds.lastX = pt.x;
          ds.lastY = pt.y;
        }
        break;
      }
      case 'draw-end':
        ds.started = false;
        saveSnapshot();
        break;
      case 'draw-fill':
        floodFill(data, op.x, op.y, op.color);
        saveSnapshot();
        break;
      case 'draw-undo':
        if (snapshotsRef.current.length > 1) {
          snapshotsRef.current.pop();
          imageDataRef.current = cloneImageData(snapshotsRef.current[snapshotsRef.current.length - 1]);
        } else {
          snapshotsRef.current = [];
          imageDataRef.current = createBlankImageData();
        }
        break;
      case 'draw-clear':
        clearImageData(imageDataRef.current.data);
        snapshotsRef.current = [];
        saveSnapshot();
        break;
    }
  }

  function applyAllOps() {
    imageDataRef.current = createBlankImageData();
    snapshotsRef.current = [];
    saveSnapshot();
    drawStateRef.current = { color: '#000000', rgb: [0, 0, 0], size: 5, radius: 2, lastX: 0, lastY: 0, started: false };
    for (const op of ops) {
      applyOp(op);
    }
    appliedRef.current = ops.length;
    putImage();
  }

  function startAnimatedPlayback() {
    imageDataRef.current = createBlankImageData();
    snapshotsRef.current = [];
    saveSnapshot();
    drawStateRef.current = { color: '#000000', rgb: [0, 0, 0], size: 5, radius: 2, lastX: 0, lastY: 0, started: false };
    appliedRef.current = 0;
    putImage();

    const totalOriginalMs = ops[ops.length - 1].t ?? 0;
    const scale = totalOriginalMs > 0 ? PLAYBACK_DURATION_MS / totalOriginalMs : 1;

    function scheduleNext() {
      if (appliedRef.current >= ops.length) {
        timerRef.current = setTimeout(() => {
          startAnimatedPlayback();
        }, HOLD_DURATION_MS);
        return;
      }

      const curT = ops[appliedRef.current].t ?? 0;
      const prevT = appliedRef.current > 0 ? (ops[appliedRef.current - 1].t ?? 0) : 0;
      const delay = (curT - prevT) * scale;

      timerRef.current = setTimeout(() => {
        applyOp(ops[appliedRef.current]);
        putImage();
        appliedRef.current++;
        scheduleNext();
      }, delay);
    }

    scheduleNext();
  }

  // Initial render: show final state
  useEffect(() => {
    saveSnapshot();
    for (const op of ops) {
      applyOp(op);
    }
    appliedRef.current = ops.length;
    putImage();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // React to playing prop changes
  useEffect(() => {
    if (!hasTimestamps) return;
    if (playing) {
      startAnimatedPlayback();
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      applyAllOps();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing]);

  // For non-animated (live streaming): apply new ops as they arrive
  useEffect(() => {
    if (hasTimestamps) return;
    while (appliedRef.current < ops.length) {
      applyOp(ops[appliedRef.current]);
      appliedRef.current++;
    }
    putImage();
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
