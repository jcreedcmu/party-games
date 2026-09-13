import type { DrawOp } from './types';

// Card art is addressed by the hash of the ops that draw it, and the server
// serves those URLs as immutable, so a miss here usually still lands in the
// browser's HTTP cache. This map keeps the parsed result so a card opened
// twice in one session does not re-parse it.
//
// It is not capped: the whole library's ops are ~1.3 MB, which is what used
// to arrive with every state broadcast.
const cache = new Map<string, DrawOp[]>();
const inFlight = new Map<string, Promise<DrawOp[]>>();

export function cardOpsUrl(cardId: string, opsHash: string): string {
  return `/api/bwc/card/${encodeURIComponent(cardId)}/${encodeURIComponent(opsHash)}`;
}

export function getCachedOps(opsHash: string): DrawOp[] | undefined {
  return cache.get(opsHash);
}

// Seed the cache from ops the client already holds, so an author who just
// drew a card does not fetch it back.
export function putCachedOps(opsHash: string, ops: DrawOp[]): void {
  cache.set(opsHash, ops);
}

async function load(cardId: string, opsHash: string): Promise<DrawOp[]> {
  try {
    const res = await fetch(cardOpsUrl(cardId, opsHash));
    if (!res.ok) throw new Error(`card ops ${cardId}/${opsHash}: ${res.status}`);
    const body = (await res.json()) as { ops: DrawOp[] };
    cache.set(opsHash, body.ops);
    return body.ops;
  } finally {
    inFlight.delete(opsHash);
  }
}

// Several views can want the same card's art at once. They share one request.
export function fetchCardOps(cardId: string, opsHash: string): Promise<DrawOp[]> {
  const cached = cache.get(opsHash);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(opsHash);
  if (pending) return pending;
  // `load` reaches its `finally` only after the fetch, by which point this
  // entry exists.
  const p = load(cardId, opsHash);
  inFlight.set(opsHash, p);
  return p;
}
