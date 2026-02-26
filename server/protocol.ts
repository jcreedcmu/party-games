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

import type { EpycClientState } from './games/epyc/client-state.js';

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
  | ResetMessage;

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

export type ServerMessage = JoinedResponse | ErrorResponse | StateResponse;

// --- Client game state union (will expand with Pictionary) ---

export type ClientGameState = EpycClientState;
