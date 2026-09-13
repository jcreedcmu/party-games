import { fetchCardOps, getCachedOps } from './card-ops';
import { replayOps } from './apply-ops';
import type { DrawOp } from './types';
import type { RenderRequest, RenderResponse } from './card-art.worker';

// Card art is rendered once at this size and scaled down by CSS wherever it
// is shown. Op coordinates are absolute pixels with no scale factor, so
// rendering smaller would crop rather than shrink.
export const ART_W = 800;
export const ART_H = 600;

// Lower runs first. Cards on the table and in a hand are being looked at now;
// library thumbnails are not.
export const PRIORITY_VISIBLE = 0;
export const PRIORITY_BACKGROUND = 1;

const urls = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Map<string, { cardId: string; priority: number }>();
let rendering = false;

export function getArtUrl(opsHash: string): string | undefined {
  return urls.get(opsHash);
}

function publish(opsHash: string, url: string): void {
  urls.set(opsHash, url);
  pending.delete(opsHash);
  for (const notify of listeners.get(opsHash) ?? []) notify();
}

// The author of a card already has its pixels on screen; handing them
// straight to the store spares a fetch and a re-render.
export function seedArt(opsHash: string, blob: Blob): void {
  if (urls.has(opsHash)) return;
  publish(opsHash, URL.createObjectURL(blob));
}

export function subscribeArt(opsHash: string, notify: () => void): () => void {
  let set = listeners.get(opsHash);
  if (!set) {
    set = new Set();
    listeners.set(opsHash, set);
  }
  set.add(notify);
  return () => {
    set.delete(notify);
    if (set.size === 0) listeners.delete(opsHash);
  };
}

export function requestArt(cardId: string, opsHash: string, priority = PRIORITY_VISIBLE): void {
  if (urls.has(opsHash)) return;
  const existing = pending.get(opsHash);
  if (existing) {
    // A card that appeared on the table while its thumbnail was still queued
    // should not wait behind the rest of the library.
    if (priority < existing.priority) existing.priority = priority;
    return;
  }
  pending.set(opsHash, { cardId, priority });
  void pump();
}

function takeNext(): { opsHash: string; cardId: string } | null {
  let best: { opsHash: string; cardId: string; priority: number } | null = null;
  for (const [opsHash, entry] of pending) {
    if (!best || entry.priority < best.priority) {
      best = { opsHash, cardId: entry.cardId, priority: entry.priority };
    }
  }
  return best;
}

// One render at a time. The point is to keep the main thread free, not to
// saturate cores, and a single queue makes priority mean what it says.
async function pump(): Promise<void> {
  if (rendering) return;
  const next = takeNext();
  if (!next) return;
  rendering = true;
  try {
    const ops = getCachedOps(next.opsHash) ?? await fetchCardOps(next.cardId, next.opsHash);
    const blob = await render(next.opsHash, ops);
    publish(next.opsHash, URL.createObjectURL(blob));
  } catch (err) {
    console.error(`card art ${next.cardId}/${next.opsHash}:`, err);
    pending.delete(next.opsHash);
  } finally {
    rendering = false;
  }
  void pump();
}

// --- Rendering backends ---

let worker: Worker | null = null;
const waiting = new Map<string, { resolve: (blob: Blob) => void; reject: (e: Error) => void }>();

function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./card-art.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<RenderResponse>) => {
      const entry = waiting.get(e.data.opsHash);
      if (!entry) return;
      waiting.delete(e.data.opsHash);
      if ('blob' in e.data) entry.resolve(e.data.blob);
      else entry.reject(new Error(e.data.error));
    };
  }
  return worker;
}

function render(opsHash: string, ops: DrawOp[]): Promise<Blob> {
  return workerSupported() ? renderInWorker(opsHash, ops) : renderOnMainThread(ops);
}

function renderInWorker(opsHash: string, ops: DrawOp[]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    waiting.set(opsHash, { resolve, reject });
    const req: RenderRequest = { opsHash, ops, w: ART_W, h: ART_H };
    getWorker().postMessage(req);
  });
}

// Fallback for browsers without OffscreenCanvas. Still off the render pass,
// just not off the main thread.
function renderOnMainThread(ops: DrawOp[]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { imageData } = replayOps(ops, ART_W, ART_H, { retainSnapshots: false });
    const canvas = document.createElement('canvas');
    canvas.width = ART_W;
    canvas.height = ART_H;
    canvas.getContext('2d')!.putImageData(imageData, 0, 0);
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob produced nothing'));
    }, 'image/png');
  });
}
