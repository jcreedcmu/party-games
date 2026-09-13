import type { PlayerId } from '../../types.js';
import type {
  BwcState,
  BwcWaitingState,
  BwcPlayingState,
  CardId,
  ObjectId,
  Pose,
  SeatIndex,
  SurfaceId,
} from './types.js';

// --- Cards ---

// Everything a client needs to draw a card except its art, which it fetches
// from /api/bwc/card/:cardId/:opsHash and renders itself. Ops are far larger
// than all of this put together, and they never change without the hash
// changing, so they have no business in a snapshot that ships on every move.
export type BwcClientCardMeta = {
  id: CardId;
  opsHash: string;
  name: string;
  cardType: string;
  text: string;
  creatorHandle: string;
};

// The cards a viewer can currently see, by id. A card is in exactly one
// place at a time, so this is a flat lookup with no duplicates: in the
// waiting room it is the whole library, and during play it is what is face
// up on the table plus what is in the viewer's own hand.
export type BwcClientCards = Record<CardId, BwcClientCardMeta>;

// --- Waiting phase projection ---

export type BwcClientWaitingState = {
  phase: 'bwc-waiting';
  players: Array<{ id: string; handle: string; ready: boolean; connected: boolean }>;
  // Library is exposed even in waiting so authors can preview the existing
  // card collection while the room fills up.
  library: CardId[];
  cards: BwcClientCards;
};

// --- Playing phase projection ---

export type BwcVisibleObject =
  | {
      kind: 'card';
      id: ObjectId;
      pose: Pose;
      z: number;
      faceUp: boolean;
      // Present iff faceUp; nulled out for face-down cards everywhere
      // (including in the owner's own hand — face-down means face-down).
      // Look it up in the state's `cards`.
      cardId?: CardId;
    }
  | {
      kind: 'deck';
      id: ObjectId;
      pose: Pose;
      z: number;
      faceUp: boolean;
      count: number;
      // Present iff the deck is face-up.
      topCardId?: CardId;
    };

// A surface as seen by a particular client. The shared table is always
// 'full'. The viewer's own hand is 'full'. Other players' hands are
// 'opaque' (count only).
export type BwcVisibleSurface =
  | { id: SurfaceId; visibility: 'full'; objects: BwcVisibleObject[] }
  | { id: SurfaceId; visibility: 'opaque'; objectCount: number };

export type BwcClientSeat = {
  playerId: PlayerId;
  handle: string;
  seat: SeatIndex;
  side: 'N' | 'E' | 'S' | 'W';
  fraction: number;  // position along side (0..1)
  score: number;
  connected: boolean;
};

export type BwcClientPlayingState = {
  phase: 'bwc-playing';
  mySeat: SeatIndex;
  seats: BwcClientSeat[];
  table: BwcVisibleSurface;       // always 'full'
  myHand: BwcVisibleSurface;      // always 'full'
  otherHands: BwcVisibleSurface[]; // always 'opaque'
  cards: BwcClientCards;
};

export type BwcClientState = BwcClientWaitingState | BwcClientPlayingState;

// --- Projection ---

function cardMeta(card: import('./types.js').Card): BwcClientCardMeta {
  return {
    id: card.id,
    opsHash: card.opsHash,
    name: card.name,
    cardType: card.cardType,
    text: card.text,
    creatorHandle: card.creator,
  };
}

function getWaitingClientState(state: BwcWaitingState): BwcClientWaitingState {
  const cards: BwcClientCards = {};
  for (const card of state.library.values()) cards[card.id] = cardMeta(card);
  return {
    phase: 'bwc-waiting',
    players: Array.from(state.players.values()).map(p => ({
      id: p.id,
      handle: p.handle,
      ready: p.ready,
      connected: p.connected,
    })),
    library: Array.from(state.library.keys()),
    cards,
  };
}

// Projecting an object also records the card it reveals, so the `cards` map
// ends up holding exactly what the viewer can see and nothing more.
function projectObject(
  obj: import('./types.js').TableObject,
  library: import('./types.js').CardLibrary,
  seen: BwcClientCards,
): BwcVisibleObject {
  function reveal(cardId: CardId | undefined): CardId | undefined {
    const card = cardId ? library.get(cardId) : undefined;
    if (!card) return undefined;
    seen[card.id] = cardMeta(card);
    return card.id;
  }

  if (obj.kind === 'card') {
    const cardId = obj.faceUp ? reveal(obj.cardId) : undefined;
    return {
      kind: 'card',
      id: obj.id,
      pose: obj.pose,
      z: obj.z,
      faceUp: obj.faceUp,
      ...(cardId ? { cardId } : {}),
    };
  }
  const topCardId = obj.faceUp && obj.cardIds.length > 0
    ? reveal(obj.cardIds[obj.cardIds.length - 1])
    : undefined;
  return {
    kind: 'deck',
    id: obj.id,
    pose: obj.pose,
    z: obj.z,
    faceUp: obj.faceUp,
    count: obj.cardIds.length,
    ...(topCardId ? { topCardId } : {}),
  };
}

function projectSurfaceFull(
  surface: import('./types.js').Surface,
  library: import('./types.js').CardLibrary,
  seen: BwcClientCards,
): BwcVisibleSurface {
  const objects = Array.from(surface.objects.values()).map(obj =>
    projectObject(obj, library, seen)
  );
  return { id: surface.id, visibility: 'full', objects };
}

function projectSurfaceOpaque(surface: import('./types.js').Surface): BwcVisibleSurface {
  return { id: surface.id, visibility: 'opaque', objectCount: surface.objects.size };
}

function getPlayingClientState(
  state: BwcPlayingState,
  playerId: PlayerId,
): BwcClientPlayingState {
  const seats: BwcClientSeat[] = [];
  for (const [pid, seat] of state.seats) {
    const p = state.players.get(pid);
    if (!p) continue;
    seats.push({
      playerId: pid,
      handle: p.handle,
      seat: seat.seatIndex,
      side: seat.side,
      fraction: seat.fraction,
      score: state.scores.get(pid) ?? 0,
      connected: p.connected,
    });
  }

  const myHand = state.hands.get(playerId);
  const otherHands: BwcVisibleSurface[] = [];
  for (const [pid, hand] of state.hands) {
    if (pid === playerId) continue;
    otherHands.push(projectSurfaceOpaque(hand));
  }

  const cards: BwcClientCards = {};
  return {
    phase: 'bwc-playing',
    mySeat: state.seats.get(playerId)?.seatIndex ?? 0,
    seats,
    table: projectSurfaceFull(state.table, state.library, cards),
    myHand: myHand
      ? projectSurfaceFull(myHand, state.library, cards)
      : { id: { kind: 'hand', ownerId: playerId }, visibility: 'full', objects: [] },
    otherHands,
    cards,
  };
}

export function getClientState(state: BwcState, playerId: PlayerId): BwcClientState {
  switch (state.phase) {
    case 'bwc-waiting':
      return getWaitingClientState(state);
    case 'bwc-playing':
      return getPlayingClientState(state, playerId);
  }
}
