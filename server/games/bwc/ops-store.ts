import type { DrawOp } from '../../draw-ops.js';
import type { Card, CardLibrary } from './types.js';

// Card art is fetched from a URL that names the hash of the ops it renders,
// and those URLs are handed out as permanently valid. A hash therefore has to
// stay resolvable after the card it came from is edited: a client that
// started fetching the old art, or that is holding a state snapshot from
// before the edit, still deserves an answer rather than a 404.
//
// Entries are the ops arrays the library already holds, plus the versions
// they superseded since startup. Growth is bounded by edits made during one
// process lifetime, at roughly 30 KB each.
const opsByHash = new Map<string, DrawOp[]>();

export function registerCardOps(card: Card): void {
  opsByHash.set(card.opsHash, card.ops);
}

export function registerLibraryOps(library: CardLibrary): void {
  for (const card of library.values()) registerCardOps(card);
}

export function getOpsByHash(opsHash: string): DrawOp[] | undefined {
  return opsByHash.get(opsHash);
}
