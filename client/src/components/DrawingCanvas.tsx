import { useRef, useState, useEffect, useCallback, type PointerEvent } from 'react';

const COLORS = ['#000000', '#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#ffffff'];
const SIZES = [2, 5, 10, 20];
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

type DrawingCanvasProps = {
  onSubmit: (dataUrl: string) => void;
};

type Tool = 'pen' | 'fill';

export function DrawingCanvas({ onSubmit }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [tool, setTool] = useState<Tool>('pen');
  const [drawing, setDrawing] = useState(false);
  const undoStack = useRef<ImageData[]>([]);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return ctx;
  }, []);

  useEffect(() => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    saveSnapshot();
  }, [getCtx]);

  function saveSnapshot() {
    const ctx = getCtx();
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    undoStack.current.push(data);
    if (undoStack.current.length > 30) {
      undoStack.current.shift();
    }
  }

  function floodFill(startX: number, startY: number, fillColor: string) {
    const ctx = getCtx();
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imageData.data;

    // Parse fill color
    const tmp = document.createElement('canvas').getContext('2d')!;
    tmp.fillStyle = fillColor;
    tmp.fillRect(0, 0, 1, 1);
    const [fr, fg, fb] = tmp.getImageData(0, 0, 1, 1).data;

    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    if (sx < 0 || sx >= CANVAS_WIDTH || sy < 0 || sy >= CANVAS_HEIGHT) return;

    const idx = (sy * CANVAS_WIDTH + sx) * 4;
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];

    // Don't fill if target color is the same as fill color
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
    saveSnapshot();
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    if (tool === 'fill') {
      floodFill(x, y, color);
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    setDrawing(true);

    const ctx = getCtx();
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    // Draw a dot immediately so a click without drag leaves a mark
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp() {
    if (!drawing) return;
    setDrawing(false);
    saveSnapshot();
  }

  function handleUndo() {
    const ctx = getCtx();
    if (!ctx || undoStack.current.length <= 1) return;
    undoStack.current.pop(); // remove current
    const prev = undoStack.current[undoStack.current.length - 1];
    ctx.putImageData(prev, 0, 0);
  }

  function handleClear() {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    saveSnapshot();
  }

  function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSubmit(canvas.toDataURL('image/png'));
  }

  return (
    <div className="drawing-canvas">
      <canvas
        ref={canvasRef}
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
            title="Pen"
          >
            Pen
          </button>
          <button
            className={'tool-btn' + (tool === 'fill' ? ' active' : '')}
            onClick={() => setTool('fill')}
            title="Fill"
          >
            Fill
          </button>
        </div>
        <div className="color-palette">
          {COLORS.map(c => (
            <button
              key={c}
              className={'color-swatch' + (c === color ? ' active' : '')}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        {tool === 'pen' && <div className="size-picker">
          {SIZES.map(s => (
            <button
              key={s}
              className={'size-btn' + (s === size ? ' active' : '')}
              onClick={() => setSize(s)}
            >
              <span className="size-dot" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>}
        <div className="drawing-actions">
          <button onClick={handleUndo}>Undo</button>
          <button onClick={handleClear}>Clear</button>
          <button onClick={handleSubmit} className="submit-btn">Submit</button>
        </div>
      </div>
    </div>
  );
}
