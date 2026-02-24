export type PlayerId = string;

export type MoveType = 'text' | 'drawing';

export type PlayerInfo = {
  id: PlayerId;
  handle: string;
  ready: boolean;
  connected: boolean;
};

export type Move = {
  type: MoveType;
  content: string;
  playerId: PlayerId;
};

export type Sheet = {
  originIndex: number;
  moves: (Move | null)[]; // moves[r] = move from round r, null if not submitted
};

export type WaitingState = {
  phase: 'waiting';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
};

export type UnderwayState = {
  phase: 'underway';
  players: Map<PlayerId, PlayerInfo>;
  sheets: Sheet[];
  order: PlayerId[];
  currentRound: number;
  firstMoveType: MoveType;
  roundDeadline: number;
  submittedThisRound: Set<PlayerId>;
};

export type PostgameState = {
  phase: 'postgame';
  players: Map<PlayerId, PlayerInfo>;
  sheets: Sheet[];
  order: PlayerId[];
};

export type GameState = WaitingState | UnderwayState | PostgameState;
