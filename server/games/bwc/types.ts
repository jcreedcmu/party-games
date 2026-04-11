import type { PlayerId, PlayerInfo } from '../../types.js';
import type { DrawOp } from '../../draw-ops.js';

// --- Atomic id types ---

// Stable across games (library-wide). A CardId identifies one *unique*
// physical card: at any moment a card is in exactly one location (library
// limbo, on the table, inside a deck, or in some player's hand). There is
// no notion of "spawning a copy" — to mirror real-world physics, each card
// exists in exactly one place at a time.
export type CardId = string;

// Identifies an instance of a TableObject living on a particular surface.
// (For cards, the same CardId may appear under different ObjectIds across
// time as cards are taken into and out of decks, but never simultaneously.)
export type ObjectId = string;

// 0..N-1, assigned at the waiting → playing transition.
export type SeatIndex = number;

// --- Cards (library entries) ---

export type Card = {
  id: CardId;
  ops: DrawOp[];           // front art
  text: string;            // description of what the card does
  creator: PlayerId;       // playerId of original author (stable id, not handle)
  createdAt: string;       // stringified Date
};

// --- Geometry ---

// A position on a surface. Coordinates are in "surface space" — a fixed
// logical square. Each client rotates the table render so its own seat
// is at the bottom. `rot` is in degrees and will typically be one of
// 0/90/180/270 in practice.
export type Pose = { x: number; y: number; rot: number };

// --- Surfaces ---

// A "surface" is a 2D space containing objects. The shared table is one
// surface; each player's hand is another (private) surface. Surfaces share
// the same coordinate conventions and the same set of object kinds, so
// most operations (move, flip, bring-to-front, form-deck, etc.) work
// uniformly regardless of which surface an object lives on.
export type SurfaceId =
  | { kind: 'table' }
  | { kind: 'hand'; ownerId: PlayerId };

export type TableObject =
  | { kind: 'card'; id: ObjectId; cardId: CardId; pose: Pose; faceUp: boolean; z: number }
  | { kind: 'deck'; id: ObjectId; cardIds: CardId[]; pose: Pose; faceUp: boolean; z: number };

export type Surface = {
  id: SurfaceId;
  objects: Map<ObjectId, TableObject>;
  zCounter: number;
};

// --- Phase states ---

// The card library is the in-memory store of every card definition that
// exists. It lives on both phase states so it survives waiting→playing
// transitions and reset. (Step 10 will promote this to disk-backed
// storage; for now everything is in memory.)
export type CardLibrary = Map<CardId, Card>;

export type BwcWaitingState = {
  phase: 'bwc-waiting';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
  library: CardLibrary;
};

export type BwcPlayingState = {
  phase: 'bwc-playing';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
  library: CardLibrary;
  // CardIds that are currently on a surface, in a deck, or in a hand.
  // A card can only be spawned if it's NOT in this set.
  inPlay: Set<CardId>;
  seats: Map<PlayerId, SeatIndex>;
  table: Surface;
  hands: Map<PlayerId, Surface>;
  scores: Map<PlayerId, number>;
  nextObjectId: number;
};

export type BwcState = BwcWaitingState | BwcPlayingState;
