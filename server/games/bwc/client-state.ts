import type { PlayerId } from '../../types.js';
import type { DrawOp } from '../../draw-ops.js';
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

// --- Waiting phase projection ---

export type BwcClientWaitingState = {
  phase: 'bwc-waiting';
  players: Array<{ id: string; handle: string; ready: boolean; connected: boolean }>;
  // Library is exposed even in waiting so authors can preview the existing
  // card collection while the room fills up.
  library: BwcClientCardSummary[];
};

// --- Playing phase projection ---

export type BwcClientCardSummary = {
  id: CardId;
  ops: DrawOp[];
  name: string;
  cardType: string;
  text: string;
  creatorHandle: string;
  createdAt: string;
};

export type BwcClientCardFull = {
  id: CardId;
  ops: DrawOp[];
  name: string;
  cardType: string;
  text: string;
  creatorHandle: string;
};

export type BwcVisibleObject =
  | {
      kind: 'card';
      id: ObjectId;
      pose: Pose;
      z: number;
      faceUp: boolean;
      // Present iff faceUp; nulled out for face-down cards everywhere
      // (including in the owner's own hand — face-down means face-down).
      card?: BwcClientCardFull;
    }
  | {
      kind: 'deck';
      id: ObjectId;
      pose: Pose;
      z: number;
      faceUp: boolean;
      count: number;
      // Present iff the deck is face-up.
      topCard?: BwcClientCardFull;
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
  library: BwcClientCardSummary[];
};

export type BwcClientState = BwcClientWaitingState | BwcClientPlayingState;

// --- Projection ---

function summarizeLibrary(state: BwcWaitingState | BwcPlayingState): BwcClientCardSummary[] {
  const out: BwcClientCardSummary[] = [];
  for (const card of state.library.values()) {
    const creatorHandle = card.creator;
    out.push({
      id: card.id,
      ops: card.ops,
      name: card.name,
      cardType: card.cardType,
      text: card.text,
      creatorHandle,
      createdAt: card.createdAt,
    });
  }
  return out;
}

function getWaitingClientState(state: BwcWaitingState): BwcClientWaitingState {
  return {
    phase: 'bwc-waiting',
    players: Array.from(state.players.values()).map(p => ({
      id: p.id,
      handle: p.handle,
      ready: p.ready,
      connected: p.connected,
    })),
    library: summarizeLibrary(state),
  };
}

function projectObject(
  obj: import('./types.js').TableObject,
  library: import('./types.js').CardLibrary,
  players: Map<PlayerId, import('../../types.js').PlayerInfo>,
): BwcVisibleObject {
  if (obj.kind === 'card') {
    const card = library.get(obj.cardId);
    return {
      kind: 'card',
      id: obj.id,
      pose: obj.pose,
      z: obj.z,
      faceUp: obj.faceUp,
      ...(obj.faceUp && card ? {
        card: {
          id: card.id,
          ops: card.ops,
          name: card.name,
          cardType: card.cardType,
          text: card.text,
          creatorHandle: card.creator,
        },
      } : {}),
    };
  }
  // deck
  const topCardId = obj.cardIds.length > 0 ? obj.cardIds[obj.cardIds.length - 1] : undefined;
  const topCardDef = topCardId ? library.get(topCardId) : undefined;
  return {
    kind: 'deck',
    id: obj.id,
    pose: obj.pose,
    z: obj.z,
    faceUp: obj.faceUp,
    count: obj.cardIds.length,
    ...(obj.faceUp && topCardDef ? {
      topCard: {
        id: topCardDef.id,
        ops: topCardDef.ops,
        name: topCardDef.name,
        cardType: topCardDef.cardType,
        text: topCardDef.text,
        creatorHandle: topCardDef.creator,
      },
    } : {}),
  };
}

function projectSurfaceFull(
  surface: import('./types.js').Surface,
  library: import('./types.js').CardLibrary,
  players: Map<PlayerId, import('../../types.js').PlayerInfo>,
): BwcVisibleSurface {
  const objects = Array.from(surface.objects.values()).map(obj =>
    projectObject(obj, library, players)
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

  return {
    phase: 'bwc-playing',
    mySeat: state.seats.get(playerId)?.seatIndex ?? 0,
    seats,
    table: projectSurfaceFull(state.table, state.library, state.players),
    myHand: myHand
      ? projectSurfaceFull(myHand, state.library, state.players)
      : { id: { kind: 'hand', ownerId: playerId }, visibility: 'full', objects: [] },
    otherHands,
    library: summarizeLibrary(state),
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
