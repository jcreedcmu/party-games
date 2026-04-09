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
  text: string;
  creatorHandle: string;
  createdAt: string;
};

export type BwcClientCardFull = {
  id: CardId;
  ops: DrawOp[];
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
    const creatorHandle = state.players.get(card.creator)?.handle ?? 'unknown';
    out.push({
      id: card.id,
      ops: card.ops,
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

function getPlayingClientState(
  _state: BwcPlayingState,
  _playerId: PlayerId,
): BwcClientPlayingState {
  // Step 2 only declares the type; full projection logic lands alongside
  // the playing-phase reducer in step 4 onward. Throwing here keeps the
  // contract honest until then.
  throw new Error('bwc playing-phase projection not implemented yet');
}

export function getClientState(state: BwcState, playerId: PlayerId): BwcClientState {
  switch (state.phase) {
    case 'bwc-waiting':
      return getWaitingClientState(state);
    case 'bwc-playing':
      return getPlayingClientState(state, playerId);
  }
}
