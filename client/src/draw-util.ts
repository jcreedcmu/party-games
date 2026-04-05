export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 500;

export function parseColor(color: string): [number, number, number] {
  const tmp = document.createElement('canvas');
  tmp.width = 1;
  tmp.height = 1;
  const ctx = tmp.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function setPixel(data: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) return;
  const i = (y * CANVAS_WIDTH + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = 255;
}

export function stampCircle(
  data: Uint8ClampedArray,
  cx: number, cy: number,
  radius: number,
  r: number, g: number, b: number,
): void {
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const ir = Math.ceil(radius);
  const r2 = radius * radius;
  for (let dy = -ir; dy <= ir; dy++) {
    for (let dx = -ir; dx <= ir; dx++) {
      if (dx * dx + dy * dy <= r2) {
        setPixel(data, icx + dx, icy + dy, r, g, b);
      }
    }
  }
}

export function drawLineSegment(
  data: Uint8ClampedArray,
  x0: number, y0: number,
  x1: number, y1: number,
  radius: number,
  r: number, g: number, b: number,
): void {
  const ix0 = Math.round(x0), iy0 = Math.round(y0);
  const ix1 = Math.round(x1), iy1 = Math.round(y1);
  let dx = Math.abs(ix1 - ix0);
  let dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  let cx = ix0;
  let cy = iy0;

  for (;;) {
    stampCircle(data, cx, cy, radius, r, g, b);
    if (cx === ix1 && cy === iy1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

export function floodFill(
  data: Uint8ClampedArray,
  startX: number, startY: number,
  fillColor: string,
): void {
  const [fr, fg, fb] = parseColor(fillColor);

  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sx >= CANVAS_WIDTH || sy < 0 || sy >= CANVAS_HEIGHT) return;

  const idx = (sy * CANVAS_WIDTH + sx) * 4;
  const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];

  if (tr === fr && tg === fg && tb === fb && ta === 255) return;

  function matches(i: number) {
    return data[i] === tr && data[i + 1] === tg && data[i + 2] === tb && data[i + 3] === ta;
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
}

export function clearImageData(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
}

export function createBlankImageData(): ImageData {
  if (typeof ImageData === 'undefined') {
    // SSR stub — canvas components won't render meaningfully server-side
    return { data: new Uint8ClampedArray(0), width: CANVAS_WIDTH, height: CANVAS_HEIGHT, colorSpace: 'srgb' } as ImageData;
  }
  const img = new ImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
  clearImageData(img.data);
  return img;
}

export function cloneImageData(src: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(src.data), CANVAS_WIDTH, CANVAS_HEIGHT);
}
