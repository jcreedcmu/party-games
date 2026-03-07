import type { MoveType, GameType } from './types.js';
import type { DrawStartOp, DrawMoveOp, DrawEndOp, DrawFillOp, DrawUndoOp, DrawClearOp } from './draw-ops.js';

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
};

export type ReadyMessage = { type: 'ready' };
export type UnreadyMessage = { type: 'unready' };

export type SubmitMessage = {
  type: 'submit';
  move: { type: MoveType; content: string };
};

export type ResetMessage = { type: 'reset' };

export type ClientMessage =
  | JoinMessage
  | ReadyMessage
  | UnreadyMessage
  | SubmitMessage
  | ResetMessage
  | DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp
  | { type: 'guess'; text: string }
  | { type: 'turn-done' }
  | { type: 'pick-word'; index: number }
  | { type: 'add-word'; word: string };

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
export type ClientGameState = EpycClientState | PictionaryClientState;
