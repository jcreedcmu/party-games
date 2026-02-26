import type { PlayerId, PlayerInfo } from '../../types.js';
import type { DrawOp } from '../../protocol.js';

export type TurnRecord = {
  drawerId: PlayerId;
  word: string;
  drawOps: DrawOp[];
  correctGuessers: Array<{ playerId: PlayerId; timeMs: number }>;
};

export type PictionaryWaitingState = {
  phase: 'pictionary-waiting';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
};

export type PictionaryActiveState = {
  phase: 'pictionary-active';
  players: Map<PlayerId, PlayerInfo>;
  order: PlayerId[];
  currentTurnIndex: number;
  word: string;
  scores: Map<PlayerId, number>;
  turnDeadline: number;
  turnStartTime: number;
  correctGuessers: Array<{ playerId: PlayerId; timeMs: number }>;
  currentTurnOps: DrawOp[];
  completedTurns: TurnRecord[];
};

export type PictionaryPostgameState = {
  phase: 'pictionary-postgame';
  players: Map<PlayerId, PlayerInfo>;
  scores: Map<PlayerId, number>;
  turns: TurnRecord[];
};

export type PictionaryState =
  | PictionaryWaitingState
  | PictionaryActiveState
  | PictionaryPostgameState;
