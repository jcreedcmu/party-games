import type { RelayPayload } from './protocol.js';

export type PlayerId = string;

export type MoveType = 'text' | 'drawing';

export type GameType = 'epyc' | 'pictionary';

export type PlayerInfo = {
  id: PlayerId;
  handle: string;
  ready: boolean;
  connected: boolean;
};

export type RelayMessage = {
  to: PlayerId[];
  payload: RelayPayload;
};

// ServerState is the union of all game states
import type { EpycState } from './games/epyc/types.js';
import type { PictionaryState } from './games/pictionary/types.js';
export type ServerState = EpycState | PictionaryState;
