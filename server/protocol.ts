import type { MoveType, GameType, PlayerId } from './types.js';
import type { DrawStartOp, DrawMoveOp, DrawEndOp, DrawFillOp, DrawUndoOp, DrawClearOp, DrawOp } from './draw-ops.js';
import type { CardId, ObjectId, Pose, SurfaceId } from './games/bwc/types.js';

// Re-export DrawOp types for convenience
export type { DrawOp, DrawStartOp, DrawMoveOp, DrawEndOp, DrawFillOp, DrawUndoOp, DrawClearOp } from './draw-ops.js';

// --- Relay payload (server -> specific clients) ---

export type RelayPayload =
  | DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp
  | { type: 'guess-result'; handle: string; correct: boolean; text: string | null };

// --- Client -> Server messages ---

export type JoinMessage = {
  type: 'join';
  password: string;
  handle: string;
  clientId: string;
};

export type ReadyMessage = { type: 'ready' };
export type UnreadyMessage = { type: 'unready' };

export type SubmitMessage = {
  type: 'submit';
  move: { type: MoveType; content: string };
};

export type ResetMessage = { type: 'reset' };

export type GuessMessage = { type: 'guess'; text: string };
export type TurnDoneMessage = { type: 'turn-done' };
export type PickWordMessage = { type: 'pick-word'; index: number };
export type AddWordMessage = { type: 'add-word'; word: string };
export type BootMessage = { type: 'boot'; targetId: string };

// Grouped by game for readability
export type CommonClientMessage = JoinMessage | ReadyMessage | UnreadyMessage | ResetMessage | BootMessage;
export type EpycClientMessage = SubmitMessage;
export type DrawClientMessage = DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp;
export type PictionaryClientMessage = GuessMessage | TurnDoneMessage | PickWordMessage | AddWordMessage;

// --- BWC client messages ---
//
// All object-targeting messages identify their target by (surface, objectId).
// Cross-surface moves are expressed by `bwc-move-object` with a different
// destination surface — there are no separate take-to-hand / play-from-hand
// messages.

export type BwcCreateCardMessage = {
  type: 'bwc-create-card';
  ops: DrawOp[];
  name: string;
  cardType: string;
  text: string;
};

export type BwcEditCardMessage = {
  type: 'bwc-edit-card';
  cardId: CardId;
  ops: DrawOp[];
  name: string;
  cardType: string;
  text: string;
};

export type BwcSpawnCardMessage = {
  type: 'bwc-spawn-card';
  cardId: CardId;
  surface: SurfaceId;
  pose: Pose;
  faceUp: boolean;
};

export type BwcMoveObjectMessage = {
  type: 'bwc-move-object';
  from: SurfaceId;
  objectId: ObjectId;
  to: SurfaceId;
  pose: Pose;
};

export type BwcFlipObjectMessage = {
  type: 'bwc-flip-object';
  surface: SurfaceId;
  objectId: ObjectId;
};

export type BwcBringToFrontMessage = {
  type: 'bwc-bring-to-front';
  surface: SurfaceId;
  objectId: ObjectId;
};

export type BwcDeleteObjectMessage = {
  type: 'bwc-delete-object';
  surface: SurfaceId;
  objectId: ObjectId;
};

export type BwcDrawFromDeckMessage = {
  type: 'bwc-draw-from-deck';
  surface: SurfaceId;
  deckId: ObjectId;
  to: SurfaceId;
  pose: Pose;
};

export type BwcReturnToDeckMessage = {
  type: 'bwc-return-to-deck';
  srcSurface: SurfaceId;
  objectId: ObjectId;
  deckSurface: SurfaceId;
  deckId: ObjectId;
  position: 'top' | 'bottom';
};

export type BwcShuffleDeckMessage = {
  type: 'bwc-shuffle-deck';
  surface: SurfaceId;
  deckId: ObjectId;
};

export type BwcFormDeckMessage = {
  type: 'bwc-form-deck';
  surface: SurfaceId;
  objectIds: ObjectId[];
  pose: Pose;
};

export type BwcSetScoreMessage = {
  type: 'bwc-set-score';
  playerId: PlayerId;
  score: number;
};

export type BwcAdjustScoreMessage = {
  type: 'bwc-adjust-score';
  playerId: PlayerId;
  delta: number;
};

export type BwcTidyHandMessage = {
  type: 'bwc-tidy-hand';
};

export type BwcSingleMessage =
  | BwcCreateCardMessage
  | BwcEditCardMessage
  | BwcSpawnCardMessage
  | BwcMoveObjectMessage
  | BwcFlipObjectMessage
  | BwcBringToFrontMessage
  | BwcDeleteObjectMessage
  | BwcDrawFromDeckMessage
  | BwcReturnToDeckMessage
  | BwcShuffleDeckMessage
  | BwcFormDeckMessage
  | BwcSetScoreMessage
  | BwcAdjustScoreMessage
  | BwcTidyHandMessage;

export type BwcBatchMessage = {
  type: 'bwc-batch';
  messages: BwcSingleMessage[];
};

export type BwcClientMessage =
  | BwcSingleMessage
  | BwcBatchMessage;

export type ClientMessage =
  | CommonClientMessage
  | EpycClientMessage
  | DrawClientMessage
  | PictionaryClientMessage
  | BwcClientMessage;

// --- Server -> Client messages ---

export type JoinedResponse = {
  type: 'joined';
  playerId: string;
  gameType: GameType;
};

export type ErrorResponse = {
  type: 'error';
  message: string;
};

export type StateResponse = {
  type: 'state';
  state: ClientGameState;
};

export type RelayResponse = {
  type: 'relay';
  payload: RelayPayload;
};

export type AddWordResponse = {
  type: 'add-word-result';
  success: boolean;
  message: string;
};

export type ServerMessage = JoinedResponse | ErrorResponse | StateResponse | RelayResponse | AddWordResponse;

// --- Client game state union ---

import type { EpycClientState } from './games/epyc/client-state.js';
import type { PictionaryClientState } from './games/pictionary/client-state.js';
import type { BwcClientState } from './games/bwc/client-state.js';
export type ClientGameState = EpycClientState | PictionaryClientState | BwcClientState;
