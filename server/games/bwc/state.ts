import crypto from 'node:crypto';
import type { PlayerId, PlayerInfo, ServerState, ReduceResult, Effect } from '../../types.js';
import type { ClientMessage } from '../../protocol.js';
import type { DrawOp } from '../../draw-ops.js';
import { persistLibrary, markSnapshotDirty, clearSnapshot } from './storage.js';
import type {
  BwcState,
  BwcWaitingState,
  BwcPlayingState,
  Card,
  CardId,
  CardLibrary,
  ObjectId,
  Pose,
  SeatAssignment,
  Side,
  Surface,
  SurfaceId,
  TableObject,
} from './types.js';

// --- Initial state ---

let preloadedLibrary: CardLibrary = new Map();

export function setPreloadedLibrary(library: CardLibrary): void {
  preloadedLibrary = library;
}

export function createInitialState(): BwcWaitingState {
  return {
    phase: 'bwc-waiting',
    players: new Map(),
    nextPlayerId: 1,
    library: preloadedLibrary,
  };
}

// --- Player management ---

export function addPlayer(
  state: BwcWaitingState,
  handle: string,
  clientId: string,
): { state: BwcWaitingState; playerId: PlayerId } {
  for (const [existingId, p] of state.players) {
    if (p.clientId === clientId) {
      const players = new Map(state.players);
      players.set(existingId, { ...p, handle, connected: true });
      return { state: { ...state, players }, playerId: existingId };
    }
  }
  const playerId = String(state.nextPlayerId);
  const player: PlayerInfo = { id: playerId, handle, ready: false, connected: true, clientId };
  const players = new Map(state.players);
  players.set(playerId, player);
  return {
    state: { ...state, players, nextPlayerId: state.nextPlayerId + 1 },
    playerId,
  };
}

function markDisconnected(state: BwcState, playerId: PlayerId): BwcState {
  const players = new Map(state.players);
  const p = players.get(playerId);
  if (!p) return state;
  players.set(playerId, { ...p, connected: false });
  return { ...state, players };
}

function removePlayer(state: BwcWaitingState, playerId: PlayerId): BwcWaitingState {
  const players = new Map(state.players);
  players.delete(playerId);
  return { ...state, players };
}

function setReady(state: BwcWaitingState, playerId: PlayerId, ready: boolean): BwcWaitingState {
  const players = new Map(state.players);
  const player = players.get(playerId);
  if (!player) return state;
  players.set(playerId, { ...player, ready });
  return { ...state, players };
}

// --- Library ---

function createCard(
  library: CardLibrary,
  ops: DrawOp[],
  text: string,
  creator: string,
): { library: CardLibrary; cardId: string } {
  const cardId = crypto.randomUUID();
  const card: Card = {
    id: cardId,
    ops,
    text,
    creator,
    createdAt: new Date().toISOString(),
  };
  const next = new Map(library);
  next.set(cardId, card);
  return { library: next, cardId };
}

// --- Surface helpers ---

function emptySurface(id: SurfaceId): Surface {
  return { id, objects: new Map(), zCounter: 0 };
}

function getSurface(state: BwcPlayingState, id: SurfaceId): Surface | undefined {
  if (id.kind === 'table') return state.table;
  if (id.kind === 'hand') return state.hands.get(id.ownerId);
  return undefined;
}

function setSurface(state: BwcPlayingState, surface: Surface): BwcPlayingState {
  if (surface.id.kind === 'table') {
    return { ...state, table: surface };
  }
  const hands = new Map(state.hands);
  hands.set(surface.id.ownerId, surface);
  return { ...state, hands };
}

function canAccessSurface(playerId: PlayerId, surfaceId: SurfaceId): boolean {
  if (surfaceId.kind === 'table') return true;
  return surfaceId.kind === 'hand' && surfaceId.ownerId === playerId;
}

function nextObjectId(state: BwcPlayingState): { state: BwcPlayingState; objectId: ObjectId } {
  const objectId = `obj-${state.nextObjectId}`;
  return { state: { ...state, nextObjectId: state.nextObjectId + 1 }, objectId };
}

// --- Seating algorithm ---

const SIDES: Side[] = ['S', 'N', 'E', 'W'];

// Distribute N players evenly across 4 sides, filling S first.
function computeSeats(playerIds: PlayerId[]): Map<PlayerId, SeatAssignment> {
  const n = playerIds.length;
  const perSide = [0, 0, 0, 0]; // S, E, N, W
  const base = Math.floor(n / 4);
  const remainder = n % 4;
  for (let i = 0; i < 4; i++) {
    perSide[i] = base + (i < remainder ? 1 : 0);
  }

  const seats = new Map<PlayerId, SeatAssignment>();
  let playerIdx = 0;
  let seatIndex = 0;
  for (let sideIdx = 0; sideIdx < 4; sideIdx++) {
    const count = perSide[sideIdx];
    for (let k = 0; k < count; k++) {
      seats.set(playerIds[playerIdx], {
        seatIndex,
        side: SIDES[sideIdx],
        fraction: (k + 1) / (count + 1),
      });
      playerIdx++;
      seatIndex++;
    }
  }
  return seats;
}

// --- Waiting → Playing transition ---

function checkAllReady(state: BwcWaitingState): BwcWaitingState | BwcPlayingState {
  const playerList = Array.from(state.players.values());
  const connected = playerList.filter(p => p.connected);
  if (connected.length < 1) return state;
  if (!connected.every(p => p.ready)) return state;

  const players = new Map(state.players);
  for (const [id, p] of players) {
    players.set(id, { ...p, ready: false });
  }

  const seats = computeSeats(connected.map(p => p.id));

  const hands = new Map<PlayerId, Surface>();
  const scores = new Map<PlayerId, number>();
  for (const p of connected) {
    hands.set(p.id, emptySurface({ kind: 'hand', ownerId: p.id }));
    scores.set(p.id, 0);
  }

  return {
    phase: 'bwc-playing',
    players,
    nextPlayerId: state.nextPlayerId,
    library: state.library,
    inPlay: new Set(),
    seats,
    table: emptySurface({ kind: 'table' }),
    hands,
    scores,
    nextObjectId: 1,
  };
}

// --- Playing-phase reducers ---

function reduceSpawnCard(state: BwcPlayingState, playerId: PlayerId, msg: { cardId: CardId; surface: SurfaceId; pose: Pose; faceUp: boolean }): ReduceResult {
  if (!canAccessSurface(playerId, msg.surface)) return { state, effects: [] };
  if (!state.library.has(msg.cardId)) return { state, effects: [] };
  if (state.inPlay.has(msg.cardId)) return { state, effects: [] };

  const surface = getSurface(state, msg.surface);
  if (!surface) return { state, effects: [] };

  const { state: s1, objectId } = nextObjectId(state);
  const obj: TableObject = {
    kind: 'card',
    id: objectId,
    cardId: msg.cardId,
    pose: msg.pose,
    faceUp: msg.faceUp,
    z: surface.zCounter + 1,
  };
  const objects = new Map(surface.objects);
  objects.set(objectId, obj);
  const updatedSurface: Surface = { ...surface, objects, zCounter: surface.zCounter + 1 };

  const inPlay = new Set(s1.inPlay);
  inPlay.add(msg.cardId);

  const s2 = setSurface({ ...s1, inPlay }, updatedSurface);
  return { state: s2, effects: [{ type: 'broadcast' }] };
}

function reduceMoveObject(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { from: SurfaceId; objectId: ObjectId; to: SurfaceId; pose: Pose },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.from)) return { state, effects: [] };
  if (!canAccessSurface(playerId, msg.to)) return { state, effects: [] };

  const fromSurface = getSurface(state, msg.from);
  if (!fromSurface) return { state, effects: [] };
  const obj = fromSurface.objects.get(msg.objectId);
  if (!obj) return { state, effects: [] };

  const sameSurface = msg.from.kind === msg.to.kind &&
    (msg.from.kind === 'table' || (msg.from.kind === 'hand' && msg.to.kind === 'hand' && msg.from.ownerId === msg.to.ownerId));

  if (sameSurface) {
    // Same surface — just update pose.
    const objects = new Map(fromSurface.objects);
    objects.set(msg.objectId, { ...obj, pose: msg.pose });
    const s = setSurface(state, { ...fromSurface, objects });
    return { state: s, effects: [{ type: 'broadcast' }] };
  }

  // Cross-surface move.
  const toSurface = getSurface(state, msg.to);
  if (!toSurface) return { state, effects: [] };

  // Remove from source.
  const fromObjects = new Map(fromSurface.objects);
  fromObjects.delete(msg.objectId);
  let s = setSurface(state, { ...fromSurface, objects: fromObjects });

  // Add to destination with new z.
  const toObjects = new Map(toSurface.objects);
  const newZ = toSurface.zCounter + 1;
  toObjects.set(msg.objectId, { ...obj, pose: msg.pose, z: newZ });
  // Re-fetch toSurface from s since setSurface may have modified it if from===to
  s = setSurface(s, { ...toSurface, objects: toObjects, zCounter: newZ });

  return { state: s, effects: [{ type: 'broadcast' }] };
}

function reduceBringToFront(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { surface: SurfaceId; objectId: ObjectId },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.surface)) return { state, effects: [] };
  const surface = getSurface(state, msg.surface);
  if (!surface) return { state, effects: [] };
  const obj = surface.objects.get(msg.objectId);
  if (!obj) return { state, effects: [] };

  const newZ = surface.zCounter + 1;
  const objects = new Map(surface.objects);
  objects.set(msg.objectId, { ...obj, z: newZ });
  const s = setSurface(state, { ...surface, objects, zCounter: newZ });
  return { state: s, effects: [{ type: 'broadcast' }] };
}

function reduceFlipObject(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { surface: SurfaceId; objectId: ObjectId },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.surface)) return { state, effects: [] };
  const surface = getSurface(state, msg.surface);
  if (!surface) return { state, effects: [] };
  const obj = surface.objects.get(msg.objectId);
  if (!obj) return { state, effects: [] };

  const objects = new Map(surface.objects);
  if (obj.kind === 'card') {
    objects.set(msg.objectId, { ...obj, faceUp: !obj.faceUp });
  } else if (obj.kind === 'deck') {
    // Flipping a deck reverses card order (physical model).
    objects.set(msg.objectId, {
      ...obj,
      faceUp: !obj.faceUp,
      cardIds: [...obj.cardIds].reverse(),
    });
  }
  const s = setSurface(state, { ...surface, objects });
  return { state: s, effects: [{ type: 'broadcast' }] };
}

function reduceDeleteObject(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { surface: SurfaceId; objectId: ObjectId },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.surface)) return { state, effects: [] };
  const surface = getSurface(state, msg.surface);
  if (!surface) return { state, effects: [] };
  const obj = surface.objects.get(msg.objectId);
  if (!obj) return { state, effects: [] };

  const objects = new Map(surface.objects);
  objects.delete(msg.objectId);
  let s = setSurface(state, { ...surface, objects });

  // Return cards to library limbo.
  const inPlay = new Set(s.inPlay);
  if (obj.kind === 'card') {
    inPlay.delete(obj.cardId);
  } else if (obj.kind === 'deck') {
    for (const cid of obj.cardIds) {
      inPlay.delete(cid);
    }
  }
  s = { ...s, inPlay };

  return { state: s, effects: [{ type: 'broadcast' }] };
}

// --- Deck operations ---

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function reduceFormDeck(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { surface: SurfaceId; objectIds: ObjectId[]; pose: Pose },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.surface)) return { state, effects: [] };
  const surface = getSurface(state, msg.surface);
  if (!surface) return { state, effects: [] };

  // Collect card IDs from the selected objects (must all be cards on this surface).
  const cardIds: CardId[] = [];
  for (const oid of msg.objectIds) {
    const obj = surface.objects.get(oid);
    if (!obj || obj.kind !== 'card') return { state, effects: [] };
    cardIds.push(obj.cardId);
  }
  if (cardIds.length < 2) return { state, effects: [] };

  // Remove the individual card objects.
  const objects = new Map(surface.objects);
  for (const oid of msg.objectIds) {
    objects.delete(oid);
  }

  // Create a new deck object.
  const { state: s1, objectId: deckId } = nextObjectId(state);
  const newZ = surface.zCounter + 1;
  const deck: TableObject = {
    kind: 'deck',
    id: deckId,
    cardIds,
    pose: msg.pose,
    faceUp: false,
    z: newZ,
  };
  objects.set(deckId, deck);

  const s2 = setSurface(s1, { ...surface, objects, zCounter: newZ });
  return { state: s2, effects: [{ type: 'broadcast' }] };
}

function reduceDrawFromDeck(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { surface: SurfaceId; deckId: ObjectId; to: SurfaceId; pose: Pose },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.surface)) return { state, effects: [] };
  if (!canAccessSurface(playerId, msg.to)) return { state, effects: [] };
  const surface = getSurface(state, msg.surface);
  if (!surface) return { state, effects: [] };
  const obj = surface.objects.get(msg.deckId);
  if (!obj || obj.kind !== 'deck' || obj.cardIds.length === 0) return { state, effects: [] };

  // Draw the top card (last element).
  const drawnCardId = obj.cardIds[obj.cardIds.length - 1];
  const remainingIds = obj.cardIds.slice(0, -1);

  // Update or remove the deck.
  const objects = new Map(surface.objects);
  if (remainingIds.length === 0) {
    objects.delete(msg.deckId);
  } else {
    objects.set(msg.deckId, { ...obj, cardIds: remainingIds });
  }
  let s = setSurface(state, { ...surface, objects });

  // Place the drawn card on the target surface.
  const { state: s1, objectId: cardObjId } = nextObjectId(s);
  const toSurface = getSurface(s1, msg.to);
  if (!toSurface) return { state, effects: [] };
  const newZ = toSurface.zCounter + 1;
  const card: TableObject = {
    kind: 'card',
    id: cardObjId,
    cardId: drawnCardId,
    pose: msg.pose,
    faceUp: true,
    z: newZ,
  };
  const toObjects = new Map(toSurface.objects);
  toObjects.set(cardObjId, card);
  s = setSurface(s1, { ...toSurface, objects: toObjects, zCounter: newZ });

  return { state: s, effects: [{ type: 'broadcast' }] };
}

function reduceReturnToDeck(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { srcSurface: SurfaceId; objectId: ObjectId; deckSurface: SurfaceId; deckId: ObjectId; position: 'top' | 'bottom' },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.srcSurface)) return { state, effects: [] };
  if (!canAccessSurface(playerId, msg.deckSurface)) return { state, effects: [] };

  const srcSurface = getSurface(state, msg.srcSurface);
  if (!srcSurface) return { state, effects: [] };
  const cardObj = srcSurface.objects.get(msg.objectId);
  if (!cardObj || cardObj.kind !== 'card') return { state, effects: [] };

  const deckSurface = getSurface(state, msg.deckSurface);
  if (!deckSurface) return { state, effects: [] };
  const deckObj = deckSurface.objects.get(msg.deckId);
  if (!deckObj || deckObj.kind !== 'deck') return { state, effects: [] };

  // Remove the card from its source surface.
  const srcObjects = new Map(srcSurface.objects);
  srcObjects.delete(msg.objectId);
  let s = setSurface(state, { ...srcSurface, objects: srcObjects });

  // Add the card to the deck (top = end, bottom = start).
  const deckSurfaceNow = getSurface(s, msg.deckSurface)!;
  const deckObjects = new Map(deckSurfaceNow.objects);
  const newCardIds = msg.position === 'top'
    ? [...deckObj.cardIds, cardObj.cardId]
    : [cardObj.cardId, ...deckObj.cardIds];
  deckObjects.set(msg.deckId, { ...deckObj, cardIds: newCardIds });
  s = setSurface(s, { ...deckSurfaceNow, objects: deckObjects });

  return { state: s, effects: [{ type: 'broadcast' }] };
}

function reduceShuffleDeck(
  state: BwcPlayingState,
  playerId: PlayerId,
  msg: { surface: SurfaceId; deckId: ObjectId },
): ReduceResult {
  if (!canAccessSurface(playerId, msg.surface)) return { state, effects: [] };
  const surface = getSurface(state, msg.surface);
  if (!surface) return { state, effects: [] };
  const obj = surface.objects.get(msg.deckId);
  if (!obj || obj.kind !== 'deck') return { state, effects: [] };

  const objects = new Map(surface.objects);
  objects.set(msg.deckId, { ...obj, cardIds: shuffle(obj.cardIds) });
  const s = setSurface(state, { ...surface, objects });
  return { state: s, effects: [{ type: 'broadcast' }] };
}

// --- Reset ---

function resetGame(state: BwcState): BwcWaitingState {
  const players = new Map(
    Array.from(state.players.entries())
      .filter(([, p]) => p.connected)
      .map(([id, p]) => [id, { ...p, ready: false }] as const),
  );
  return {
    phase: 'bwc-waiting',
    players,
    nextPlayerId: Math.max(0, ...Array.from(state.players.keys()).map(Number)) + 1,
    library: state.library,
  };
}

// --- Persistence hooks ---

function withSnapshotDirty(result: ReduceResult): ReduceResult {
  if (result.state.phase === 'bwc-playing') {
    markSnapshotDirty(result.state);
  }
  return result;
}

// --- Main reduce ---

export function bwcReduce(state: ServerState, playerId: PlayerId, msg: ClientMessage): ReduceResult {
  if (state.phase !== 'bwc-waiting' && state.phase !== 'bwc-playing') {
    return { state, effects: [] };
  }

  switch (msg.type) {
    // -- Common messages (both phases) --
    case 'ready':
    case 'unready': {
      if (state.phase !== 'bwc-waiting') return { state, effects: [] };
      const readied = setReady(state, playerId, msg.type === 'ready');
      const next = checkAllReady(readied);
      return { state: next, effects: [{ type: 'broadcast' }] };
    }
    case 'boot': {
      if (state.phase !== 'bwc-waiting') return { state, effects: [] };
      if (msg.targetId === playerId) return { state, effects: [] };
      if (!state.players.has(msg.targetId)) return { state, effects: [] };
      const next = removePlayer(state, msg.targetId);
      return {
        state: next,
        effects: [{ type: 'kick', playerId: msg.targetId }, { type: 'broadcast' }],
      };
    }
    case 'reset': {
      clearSnapshot();
      const next = resetGame(state);
      return { state: next, effects: [{ type: 'broadcast' }] };
    }
    case 'bwc-create-card': {
      const handle = state.players.get(playerId)?.handle ?? 'unknown';
      const { library } = createCard(state.library, msg.ops, msg.text, handle);
      persistLibrary(library);
      return { state: { ...state, library }, effects: [{ type: 'broadcast' }] };
    }
    case 'bwc-edit-card': {
      const existing = state.library.get(msg.cardId);
      if (!existing) return { state, effects: [] };
      const library = new Map(state.library);
      library.set(msg.cardId, { ...existing, ops: msg.ops, text: msg.text });
      persistLibrary(library);
      return { state: { ...state, library }, effects: [{ type: 'broadcast' }] };
    }

    // -- Playing-only messages --
    case 'bwc-spawn-card': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceSpawnCard(state, playerId, msg));
    }
    case 'bwc-move-object': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceMoveObject(state, playerId, msg));
    }
    case 'bwc-bring-to-front': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceBringToFront(state, playerId, msg));
    }
    case 'bwc-flip-object': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceFlipObject(state, playerId, msg));
    }
    case 'bwc-delete-object': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceDeleteObject(state, playerId, msg));
    }
    case 'bwc-form-deck': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceFormDeck(state, playerId, msg));
    }
    case 'bwc-draw-from-deck': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceDrawFromDeck(state, playerId, msg));
    }
    case 'bwc-return-to-deck': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceReturnToDeck(state, playerId, msg));
    }
    case 'bwc-shuffle-deck': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      return withSnapshotDirty(reduceShuffleDeck(state, playerId, msg));
    }
    case 'bwc-set-score': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      if (!state.scores.has(msg.playerId)) return { state, effects: [] };
      const scores = new Map(state.scores);
      scores.set(msg.playerId, msg.score);
      return withSnapshotDirty({ state: { ...state, scores }, effects: [{ type: 'broadcast' }] });
    }
    case 'bwc-adjust-score': {
      if (state.phase !== 'bwc-playing') return { state, effects: [] };
      if (!state.scores.has(msg.playerId)) return { state, effects: [] };
      const scores = new Map(state.scores);
      scores.set(msg.playerId, (scores.get(msg.playerId) ?? 0) + msg.delta);
      return withSnapshotDirty({ state: { ...state, scores }, effects: [{ type: 'broadcast' }] });
    }
    default:
      return { state, effects: [] };
  }
}

export function bwcReduceDisconnect(state: ServerState, playerId: PlayerId): ReduceResult {
  if (state.phase !== 'bwc-waiting' && state.phase !== 'bwc-playing') {
    return { state, effects: [] };
  }
  const next = markDisconnected(state, playerId);
  return { state: next, effects: [{ type: 'broadcast' }] };
}

export function bwcReduceTimer(state: ServerState): ReduceResult {
  return { state, effects: [] };
}
