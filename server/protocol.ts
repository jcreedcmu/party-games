import type { MoveType } from './types.js';

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
  sheetIndex: number;
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

// --- Client-side game state projections ---

export type ClientPlayerInfo = {
  id: string;
  handle: string;
  ready: boolean;
  connected: boolean;
};

export type ClientWaitingState = {
  phase: 'waiting';
  players: ClientPlayerInfo[];
};

export type ClientSheetAssigned = {
  sheetIndex: number;
  assignedToMe: true;
  assignedToHandle: string;
  expectedMoveType: MoveType;
  previousMove: { type: MoveType; content: string } | null;
  moveCount: number;
  totalMoves: number;
};

export type ClientSheetOther = {
  sheetIndex: number;
  assignedToMe: false;
  assignedToHandle: string;
  moveCount: number;
  totalMoves: number;
};

export type ClientSheetView = ClientSheetAssigned | ClientSheetOther;

export type ClientUnderwayState = {
  phase: 'underway';
  players: ClientPlayerInfo[];
  sheets: ClientSheetView[];
};

export type ClientFullSheet = {
  sheetIndex: number;
  moves: { type: MoveType; content: string; playerHandle: string }[];
};

export type ClientPostgameState = {
  phase: 'postgame';
  players: { id: string; handle: string }[];
  sheets: ClientFullSheet[];
};

export type ClientGameState =
  | ClientWaitingState
  | ClientUnderwayState
  | ClientPostgameState;
