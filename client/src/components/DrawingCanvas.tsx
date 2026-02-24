import { useRef, useState, useEffect, useCallback, type PointerEvent } from 'react';

const COLORS = ['#000000', '#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#ffffff'];
const SIZES = [2, 5, 10, 20];
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

type DrawingCanvasProps = {
  onSubmit: (dataUrl: string) => void;
};

export function DrawingCanvas({ onSubmit }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
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

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    setDrawing(true);

    const ctx = getCtx();
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
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
        <div className="size-picker">
          {SIZES.map(s => (
            <button
              key={s}
              className={'size-btn' + (s === size ? ' active' : '')}
              onClick={() => setSize(s)}
            >
              <span className="size-dot" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>
        <div className="drawing-actions">
          <button onClick={handleUndo}>Undo</button>
          <button onClick={handleClear}>Clear</button>
          <button onClick={handleSubmit} className="submit-btn">Submit</button>
        </div>
      </div>
    </div>
  );
}
