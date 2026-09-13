import type { PlayerId } from '../../types.js';
import { canEditCard, isBlankCard, blanksAvailable } from './state.js';
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
  // Whether *this* viewer may edit the card. Computed per player so the
  // client never has to be told other players' client ids.
  editable: boolean;
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
  // card collection while the room fills up, and so the room can decide
  // which of them the next game is played with. Unfilled blanks are left
  // out: they are stock, not content, and reach the table by their own
  // button.
  library: CardId[];
  cards: BwcClientCards;
  // Cards held out of the next game's deck. Everything in `library` not
  // named here is in.
  excluded: CardId[];
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
  // How many blank cards the next press of the blank-deck button would put
  // on the table: the stock cap less the blanks already out.
  blanksAvailable: number;
};

export type BwcClientState = BwcClientWaitingState | BwcClientPlayingState;

// --- Projection ---

function cardMeta(
  card: import('./types.js').Card,
  viewer: import('../../types.js').PlayerInfo | undefined,
): BwcClientCardMeta {
  return {
    id: card.id,
    opsHash: card.opsHash,
    name: card.name,
    cardType: card.cardType,
    text: card.text,
    creatorHandle: card.creator,
    editable: canEditCard(card, viewer),
  };
}

function getWaitingClientState(state: BwcWaitingState, playerId: PlayerId): BwcClientWaitingState {
  const viewer = state.players.get(playerId);
  const cards: BwcClientCards = {};
  const library: CardId[] = [];
  for (const card of state.library.values()) {
    if (isBlankCard(card)) continue;
    library.push(card.id);
    cards[card.id] = cardMeta(card, viewer);
  }
  return {
    phase: 'bwc-waiting',
    players: Array.from(state.players.values()).map(p => ({
      id: p.id,
      handle: p.handle,
      ready: p.ready,
      connected: p.connected,
    })),
    library,
    cards,
    excluded: library.filter(id => state.excluded.has(id)),
  };
}

// Projecting an object also records the card it reveals, so the `cards` map
// ends up holding exactly what the viewer can see and nothing more.
function projectObject(
  obj: import('./types.js').TableObject,
  library: import('./types.js').CardLibrary,
  viewer: import('../../types.js').PlayerInfo | undefined,
  seen: BwcClientCards,
): BwcVisibleObject {
  function reveal(cardId: CardId | undefined): CardId | undefined {
    const card = cardId ? library.get(cardId) : undefined;
    if (!card) return undefined;
    seen[card.id] = cardMeta(card, viewer);
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
  viewer: import('../../types.js').PlayerInfo | undefined,
  seen: BwcClientCards,
): BwcVisibleSurface {
  const objects = Array.from(surface.objects.values()).map(obj =>
    projectObject(obj, library, viewer, seen)
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
  const viewer = state.players.get(playerId);
  return {
    phase: 'bwc-playing',
    mySeat: state.seats.get(playerId)?.seatIndex ?? 0,
    seats,
    table: projectSurfaceFull(state.table, state.library, viewer, cards),
    myHand: myHand
      ? projectSurfaceFull(myHand, state.library, viewer, cards)
      : { id: { kind: 'hand', ownerId: playerId }, visibility: 'full', objects: [] },
    otherHands,
    cards,
    blanksAvailable: blanksAvailable(state),
  };
}

export function getClientState(state: BwcState, playerId: PlayerId): BwcClientState {
  switch (state.phase) {
    case 'bwc-waiting':
      return getWaitingClientState(state, playerId);
    case 'bwc-playing':
      return getPlayingClientState(state, playerId);
  }
}
