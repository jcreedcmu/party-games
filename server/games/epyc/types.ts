import type { PlayerId, MoveType, PlayerInfo } from '../../types.js';

export type Move = {
  type: MoveType;
  content: string;
  playerId: PlayerId;
};

export type Sheet = {
  originIndex: number;
  moves: (Move | null)[]; // moves[r] = move from round r, null if not submitted
};

export type EpycWaitingState = {
  phase: 'epyc-waiting';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
};

export type EpycUnderwayState = {
  phase: 'epyc-underway';
  players: Map<PlayerId, PlayerInfo>;
  sheets: Sheet[];
  order: PlayerId[];
  currentRound: number;
  firstMoveType: MoveType;
  roundDeadline: number;
  submittedThisRound: Set<PlayerId>;
};

export type EpycPostgameState = {
  phase: 'epyc-postgame';
  players: Map<PlayerId, PlayerInfo>;
  sheets: Sheet[];
  order: PlayerId[];
};

export type EpycState = EpycWaitingState | EpycUnderwayState | EpycPostgameState;
