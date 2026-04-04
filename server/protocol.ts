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

export type ClientMessage = CommonClientMessage | EpycClientMessage | DrawClientMessage | PictionaryClientMessage;

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
