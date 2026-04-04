import type { PlayerId, PlayerInfo } from '../../types.js';
import type { DrawOp } from '../../protocol.js';

export type GuessRecord = {
  playerId: PlayerId;
  text: string;
  correct: boolean;
};

export type TurnRecord = {
  drawerId: PlayerId;
  word: string;
  drawOps: DrawOp[];
  correctGuessers: Array<{ playerId: PlayerId; timeMs: number }>;
  guessLog: GuessRecord[];
};

export type PictionaryWaitingState = {
  phase: 'pictionary-waiting';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
};

export type PictionaryActiveState = {
  phase: 'pictionary-active';
  subPhase: 'picking' | 'drawing' | 'reveal';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
  order: PlayerId[];
  currentTurnIndex: number;
  currentRound: number;
  totalRounds: number;
  word: string;
  wordChoices: string[];
  scores: Map<PlayerId, number>;
  turnDeadline: number;
  turnStartTime: number;
  correctGuessers: Array<{ playerId: PlayerId; timeMs: number }>;
  hintLetterIndex: number;
  currentTurnOps: DrawOp[];
  currentTurnGuesses: GuessRecord[];
  completedTurns: TurnRecord[];
};

export type PictionaryPostgameState = {
  phase: 'pictionary-postgame';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
  scores: Map<PlayerId, number>;
  turns: TurnRecord[];
};

export type PictionaryState =
  | PictionaryWaitingState
  | PictionaryActiveState
  | PictionaryPostgameState;
