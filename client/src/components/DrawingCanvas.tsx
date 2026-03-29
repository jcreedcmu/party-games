import { useRef, useState, useEffect, useCallback, type RefObject, type PointerEvent } from 'react';
import type { DrawOp } from '../types';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  parseColor, stampCircle, drawLineSegment, floodFill,
  clearImageData, createBlankImageData, cloneImageData,
} from '../draw-util';

const COLORS = [
  '#000000', '#555555', '#e74c3c', '#f39c12', '#f1c40f',
  '#2ecc71', '#3498db', '#9b59b6', '#e91e8f', '#8B4513',
  '#ffffff',
];
const SIZES = [2, 5, 10, 20];
const BATCH_INTERVAL_MS = 50;

type DrawingCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mode?: 'submit' | 'stream';
  onSubmit?: (dataUrl: string) => void;
  onStreamOp?: (op: DrawOp) => void;
};

type Tool = 'pen' | 'fill';

export function DrawingCanvas({ canvasRef, mode = 'submit', onSubmit, onStreamOp }: DrawingCanvasProps) {
  const [color, setColor] = useState(COLORS[0]);
  const [customColor, setCustomColor] = useState<string | null>(null);
  const [size, setSize] = useState(SIZES[1]);
  const [tool, setTool] = useState<Tool>('pen');
  const [drawing, setDrawing] = useState(false);
  const undoStack = useRef<ImageData[]>([]);
  const pointBuffer = useRef<Array<{ x: number; y: number }>>([]);
  const batchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const imageDataRef = useRef<ImageData>(createBlankImageData());
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const isStream = mode === 'stream';

  const getCtx = useCallback(() => {
    return canvasRef.current?.getContext('2d') ?? null;
  }, []);

  function putImage() {
    const ctx = getCtx();
    if (ctx) ctx.putImageData(imageDataRef.current, 0, 0);
  }

  useEffect(() => {
    putImage();
    saveSnapshot();
  }, [getCtx]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'c': setTool('pen'); break;
        case 'z': setTool('fill'); break;
        case '1': setSize(SIZES[0]); setTool('pen'); break;
        case '2': setSize(SIZES[1]); setTool('pen'); break;
        case '3': setSize(SIZES[2]); setTool('pen'); break;
        case '4': setSize(SIZES[3]); setTool('pen'); break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function saveSnapshot() {
    undoStack.current.push(cloneImageData(imageDataRef.current));
    if (undoStack.current.length > 30) {
      undoStack.current.shift();
    }
  }

  function flushPointBuffer() {
    if (pointBuffer.current.length > 0 && onStreamOp) {
      onStreamOp({ type: 'draw-move', points: pointBuffer.current });
      pointBuffer.current = [];
    }
  }

  function startBatching() {
    batchIntervalRef.current = setInterval(flushPointBuffer, BATCH_INTERVAL_MS);
  }

  function stopBatching() {
    if (batchIntervalRef.current) {
      clearInterval(batchIntervalRef.current);
      batchIntervalRef.current = null;
    }
    flushPointBuffer();
  }

  function getCanvasXY(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
    };
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = getCanvasXY(e);
    if (!pt) return;

    if (tool === 'fill') {
      floodFill(imageDataRef.current.data, pt.x, pt.y, color);
      putImage();
      saveSnapshot();
      if (isStream) onStreamOp?.({ type: 'draw-fill', x: pt.x, y: pt.y, color });
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    setDrawing(true);

    const [r, g, b] = parseColor(color);
    const radius = Math.max(0, size / 2 - 0.5);
    stampCircle(imageDataRef.current.data, pt.x, pt.y, radius, r, g, b);
    putImage();
    lastPosRef.current = pt;

    if (isStream) {
      onStreamOp?.({ type: 'draw-start', color, size, x: pt.x, y: pt.y });
      startBatching();
    }
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const pt = getCanvasXY(e);
    if (!pt) return;
    const last = lastPosRef.current;
    if (!last) return;

    const [r, g, b] = parseColor(color);
    const radius = Math.max(0, size / 2 - 0.5);
    drawLineSegment(imageDataRef.current.data, last.x, last.y, pt.x, pt.y, radius, r, g, b);
    putImage();
    lastPosRef.current = pt;

    if (isStream) {
      pointBuffer.current.push(pt);
    }
  }

  function handlePointerUp() {
    if (!drawing) return;
    setDrawing(false);
    lastPosRef.current = null;
    saveSnapshot();

    if (isStream) {
      stopBatching();
      onStreamOp?.({ type: 'draw-end' });
    }
  }

  function handleUndo() {
    if (undoStack.current.length <= 1) return;
    undoStack.current.pop();
    const prev = undoStack.current[undoStack.current.length - 1];
    imageDataRef.current = cloneImageData(prev);
    putImage();

    if (isStream) onStreamOp?.({ type: 'draw-undo' });
  }

  function handleClear() {
    clearImageData(imageDataRef.current.data);
    putImage();
    saveSnapshot();

    if (isStream) onStreamOp?.({ type: 'draw-clear' });
  }

  function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSubmit?.(canvas.toDataURL('image/png'));
  }

  return (
    <div className="drawing-canvas">
      <canvas
        ref={canvasRef as RefObject<HTMLCanvasElement>}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ touchAction: 'none' }}
      />
      <div className="drawing-toolbar">
        <div className="tool-picker">
          <button
            className={'tool-btn' + (tool === 'pen' ? ' active' : '')}
            onClick={() => setTool('pen')}
            title="Pen (C)"
          >
            &#9998;
          </button>
          <button
            className={'tool-btn' + (tool === 'fill' ? ' active' : '')}
            onClick={() => setTool('fill')}
            title="Fill (Z)"
          >
            &#9781;
          </button>
        </div>
        <div className="color-palette">
          {COLORS.map(c => (
            <button
              key={c}
              className={'color-swatch' + (c === color && !customColor ? ' active' : '')}
              style={{ background: c }}
              onClick={() => { setColor(c); setCustomColor(null); }}
              aria-label={`Color ${c}`}
            />
          ))}
          <button
            className={'color-swatch color-swatch-custom' + (customColor ? ' active' : '')}
            style={{ background: customColor ?? color }}
            onClick={() => colorInputRef.current?.click()}
            aria-label="Custom color"
          />
          <input
            ref={colorInputRef}
            type="color"
            value={customColor ?? color}
            onChange={(e) => { setCustomColor(e.target.value); setColor(e.target.value); }}
            className="color-input-hidden"
          />
        </div>
        {tool === 'pen' && <div className="size-picker">
          {SIZES.map((s, i) => (
            <button
              key={s}
              className={'size-btn' + (s === size ? ' active' : '')}
              onClick={() => setSize(s)}
              title={`Size ${s} (${i + 1})`}
            >
              <span className="size-dot" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>}
        <div className="drawing-actions">
          <button onClick={handleUndo}>Undo</button>
          <button onClick={handleClear}>Clear</button>
          {!isStream && <button onClick={handleSubmit} className="submit-btn">Submit</button>}
        </div>
      </div>
    </div>
  );
}
