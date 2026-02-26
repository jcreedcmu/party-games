import type { MoveType, GameType } from './types.js';

// Re-export EPYC client state types
export type {
  EpycClientPlayerInfo,
  EpycClientWaitingState,
  EpycClientUnderwayPlayer,
  EpycClientUnderwayState,
  EpycClientFullSheet,
  EpycClientPostgameState,
  EpycClientState,
} from './games/epyc/client-state.js';

// Re-export Pictionary client state types
export type {
  PictionaryClientWaitingState,
  PictionaryClientActivePlayer,
  PictionaryClientActiveState,
  PictionaryClientTurnSummary,
  PictionaryClientPostgameState,
  PictionaryClientState,
} from './games/pictionary/client-state.js';

import type { EpycClientState } from './games/epyc/client-state.js';
import type { PictionaryClientState } from './games/pictionary/client-state.js';

// --- Drawing operations (used in Pictionary for real-time streaming) ---

export type DrawStartOp = { type: 'draw-start'; color: string; size: number; x: number; y: number };
export type DrawMoveOp = { type: 'draw-move'; points: Array<{ x: number; y: number }> };
export type DrawEndOp = { type: 'draw-end' };
export type DrawFillOp = { type: 'draw-fill'; x: number; y: number; color: string };
export type DrawUndoOp = { type: 'draw-undo' };
export type DrawClearOp = { type: 'draw-clear' };
export type DrawOp = DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp;

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

export type ClientGameState = EpycClientState | PictionaryClientState;
