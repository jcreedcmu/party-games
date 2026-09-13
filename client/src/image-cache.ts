import type { DrawOp } from './types';
import { replayOps } from './apply-ops';

// Pictionary's LiveCanvas is the only caller: it re-derives the whole canvas
// from the ops it has received so far, on every render, and would otherwise
// replay the entire drawing each time. A handful of entries covers the turns
// in flight; bwc card art is cached as rendered blobs in `card-art.ts`
// instead, and a 200-entry ImageData map here held up to 384 MB at 800x600.
const MAX_ENTRIES = 8;

const cache = new Map<string, ImageData>();

// Look up by pre-computed hash. Returns cached ImageData or replays and caches.
export function getOrReplay(opsHash: string, ops: DrawOp[], w: number, h: number): ImageData {
  if (opsHash) {
    const cached = cache.get(opsHash);
    if (cached && cached.width === w && cached.height === h) {
      return cached;
    }
  }
  const { imageData } = replayOps(ops, w, h, { retainSnapshots: false });
  if (opsHash) put(opsHash, imageData);
  return imageData;
}

// Check if a hash is already cached (so callers can skip work entirely).
export function has(opsHash: string): boolean {
  return cache.has(opsHash);
}

function put(key: string, imageData: ImageData): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const firstKey = cache.keys().next().value!;
    cache.delete(firstKey);
  }
  cache.set(key, imageData);
}
