export type PlayerId = string;

export type MoveType = 'text' | 'drawing';

export type GameType = 'epyc' | 'pictionary';

export type PlayerInfo = {
  id: PlayerId;
  handle: string;
  ready: boolean;
  connected: boolean;
};

// ServerState is the union of all game states (will expand with Pictionary)
import type { EpycState } from './games/epyc/types.js';
export type ServerState = EpycState;
