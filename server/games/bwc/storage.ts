import type { Card, CardId, CardLibrary } from './types.js';

// --- Card library persistence ---

type SerializedLibrary = {
  cards: Record<string, {
    ops: unknown[];
    name: string;
    cardType: string;
    text: string;
    creator: string;
    createdAt: string;
  }>;
};

let persistLibraryFn: ((data: SerializedLibrary) => void) | null = null;

export function configureLibrary(
  initial: SerializedLibrary | null,
  persist: (data: SerializedLibrary) => void,
): CardLibrary {
  persistLibraryFn = persist;
  if (!initial || !initial.cards) return new Map();
  const library: CardLibrary = new Map();
  for (const [id, entry] of Object.entries(initial.cards)) {
    library.set(id, {
      id,
      ops: entry.ops as Card['ops'],
      name: entry.name ?? '',
      cardType: entry.cardType ?? '',
      text: entry.text,
      creator: entry.creator,
      createdAt: entry.createdAt,
    });
  }
  return library;
}

export function persistLibrary(library: CardLibrary): void {
  if (!persistLibraryFn) return;
  const cards: SerializedLibrary['cards'] = {};
  for (const [id, card] of library) {
    cards[id] = {
      ops: card.ops,
      name: card.name,
      cardType: card.cardType,
      text: card.text,
      creator: card.creator,
      createdAt: card.createdAt,
    };
  }
  persistLibraryFn({ cards });
}

// --- Table snapshot persistence ---

// The snapshot captures enough of BwcPlayingState to restore after a
// server restart. Players/seats are not included — players rejoin and
// get reassigned. The snapshot stores: table objects, hand objects,
// scores, inPlay set, library (redundant but keeps snapshot self-contained),
// and nextObjectId.

type SerializedSurface = {
  objects: Array<{
    kind: string;
    id: string;
    cardId?: string;
    cardIds?: string[];
    pose: { x: number; y: number; rot: number };
    faceUp?: boolean;
    z: number;
  }>;
};

type SerializedSnapshot = {
  table: SerializedSurface;
  hands: Record<string, SerializedSurface>;
  scores: Record<string, number>;
  inPlay: string[];
  nextObjectId: number;
  zCounter: number;
  zBatchCount: number;
};

let pendingSnapshot: SerializedSnapshot | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let persistSnapshotFn: ((data: SerializedSnapshot | null) => void) | null = null;

export function configureSnapshot(
  persist: (data: SerializedSnapshot | null) => void,
): void {
  persistSnapshotFn = persist;
  // Flush pending snapshots every 5 seconds.
  if (snapshotTimer) clearInterval(snapshotTimer);
  snapshotTimer = setInterval(() => {
    if (pendingSnapshot && persistSnapshotFn) {
      persistSnapshotFn(pendingSnapshot);
      pendingSnapshot = null;
    }
  }, 5000);
}

import type { BwcPlayingState, Surface, TableObject } from './types.js';

function serializeSurface(surface: Surface): SerializedSurface {
  const objects: SerializedSurface['objects'] = [];
  for (const obj of surface.objects.values()) {
    if (obj.kind === 'card') {
      objects.push({ kind: 'card', id: obj.id, cardId: obj.cardId, pose: obj.pose, faceUp: obj.faceUp, z: obj.z });
    } else {
      objects.push({ kind: 'deck', id: obj.id, cardIds: obj.cardIds, pose: obj.pose, faceUp: obj.faceUp, z: obj.z });
    }
  }
  return { objects };
}

export function markSnapshotDirty(state: BwcPlayingState): void {
  const hands: Record<string, SerializedSurface> = {};
  for (const [pid, hand] of state.hands) {
    hands[pid] = serializeSurface(hand);
  }
  const scores: Record<string, number> = {};
  for (const [pid, score] of state.scores) {
    scores[pid] = score;
  }
  pendingSnapshot = {
    table: serializeSurface(state.table),
    hands,
    scores,
    inPlay: Array.from(state.inPlay),
    nextObjectId: state.nextObjectId,
    zCounter: state.zCounter,
    zBatchCount: state.zBatchCount,
  };
}

export function clearSnapshot(): void {
  pendingSnapshot = null;
  if (persistSnapshotFn) {
    persistSnapshotFn(null);
  }
}

function deserializeSurface(data: SerializedSurface, id: import('./types.js').SurfaceId): Surface {
  const objects = new Map<string, TableObject>();
  for (const obj of data.objects) {
    if (obj.kind === 'card' && obj.cardId != null) {
      objects.set(obj.id, {
        kind: 'card',
        id: obj.id,
        cardId: obj.cardId,
        pose: obj.pose,
        faceUp: obj.faceUp ?? true,
        z: obj.z,
      });
    } else if (obj.kind === 'deck' && obj.cardIds != null) {
      objects.set(obj.id, {
        kind: 'deck',
        id: obj.id,
        cardIds: obj.cardIds,
        pose: obj.pose,
        faceUp: obj.faceUp ?? false,
        z: obj.z,
      });
    }
  }
  return { id, objects };
}

export function loadSnapshot(data: SerializedSnapshot | null): {
  table: Surface;
  hands: Map<string, Surface>;
  scores: Map<string, number>;
  inPlay: Set<string>;
  nextObjectId: number;
  zCounter: number;
  zBatchCount: number;
} | null {
  if (!data) return null;
  const table = deserializeSurface(data.table, { kind: 'table' });
  const hands = new Map<string, Surface>();
  for (const [pid, surfData] of Object.entries(data.hands)) {
    hands.set(pid, deserializeSurface(surfData, { kind: 'hand', ownerId: pid }));
  }
  const scores = new Map(Object.entries(data.scores));
  const inPlay = new Set(data.inPlay);
  return {
    table, hands, scores, inPlay,
    nextObjectId: data.nextObjectId,
    zCounter: data.zCounter ?? 1,
    zBatchCount: data.zBatchCount ?? 0,
  };
}

export function flushSnapshot(): void {
  if (pendingSnapshot && persistSnapshotFn) {
    persistSnapshotFn(pendingSnapshot);
    pendingSnapshot = null;
  }
}
