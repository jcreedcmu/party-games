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

export type Side = 'S' | 'E' | 'N' | 'W';

export type SeatAssignment = {
  seatIndex: SeatIndex;
  side: Side;
  // Fractional position along the side (0..1), for even spacing.
  fraction: number;
};

// --- Cards (library entries) ---

export type Card = {
  id: CardId;
  ops: DrawOp[];           // front art
  name: string;            // card name (top of card)
  cardType: string;        // card type (between art and rules)
  text: string;            // rules text (main text box)
  creator: string;          // handle of original author
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
  seats: Map<PlayerId, SeatAssignment>;
  table: Surface;
  hands: Map<PlayerId, Surface>;
  scores: Map<PlayerId, number>;
  nextObjectId: number;
  zCounter: number;       // next z-index to allocate
  zBatchCount: number;    // number of z-batch allocations since last GC
};

export type BwcState = BwcWaitingState | BwcPlayingState;
