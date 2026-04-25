import type { DrawOp } from './types';
import { replayOps } from './apply-ops';
import { cloneImageData } from './draw-util';

const MAX_ENTRIES = 200;

const cache = new Map<string, ImageData>();
const urlCache = new Map<string, string>();

// Shared offscreen canvas for ImageData → data URL conversion.
let _offCanvas: HTMLCanvasElement | null = null;
function getOffscreenCanvas(w: number, h: number): HTMLCanvasElement {
  if (!_offCanvas) _offCanvas = document.createElement('canvas');
  if (_offCanvas.width !== w || _offCanvas.height !== h) {
    _offCanvas.width = w;
    _offCanvas.height = h;
  }
  return _offCanvas;
}

function imageDataToUrl(imageData: ImageData): string {
  const c = getOffscreenCanvas(imageData.width, imageData.height);
  const ctx = c.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return c.toDataURL();
}

// Simple djb2 hash — kept for putOps (CardEditor doesn't have a server hash yet)
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function hashOps(ops: DrawOp[]): string {
  return hashString(JSON.stringify(ops));
}

// Look up by pre-computed hash. Returns cached ImageData or replays and caches.
export function getOrReplay(opsHash: string, ops: DrawOp[], w: number, h: number): ImageData {
  const cached = cache.get(opsHash);
  if (cached && cached.width === w && cached.height === h) {
    return cached;
  }
  const { imageData } = replayOps(ops, w, h);
  put(opsHash, imageData);
  return imageData;
}

// Get a data URL for the given ops, using cache. Returns the URL.
export function getImageUrl(opsHash: string, ops: DrawOp[], w: number, h: number): string {
  const cached = urlCache.get(opsHash);
  if (cached) return cached;
  const imageData = getOrReplay(opsHash, ops, w, h);
  const url = imageDataToUrl(imageData);
  urlCache.set(opsHash, url);
  return url;
}

// Check if a hash is already cached (so callers can skip work entirely).
export function has(opsHash: string): boolean {
  return cache.has(opsHash);
}

export function hasUrl(opsHash: string): boolean {
  return urlCache.has(opsHash);
}

function put(key: string, imageData: ImageData): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const firstKey = cache.keys().next().value!;
    cache.delete(firstKey);
    urlCache.delete(firstKey);
  }
  cache.set(key, imageData);
}

export function putOps(ops: DrawOp[], imageData: ImageData): void {
  const key = hashOps(ops);
  put(key, cloneImageData(imageData));
  // Also generate URL eagerly so it's ready when the card is displayed
  const url = imageDataToUrl(imageData);
  urlCache.set(key, url);
}
