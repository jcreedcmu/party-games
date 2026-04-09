import type { RelayPayload } from './protocol.js';

export type PlayerId = string;

export type MoveType = 'text' | 'drawing';

export type GameType = 'epyc' | 'pictionary' | 'bwc';

export type PlayerInfo = {
  id: PlayerId;
  handle: string;
  ready: boolean;
  connected: boolean;
  // Stable client identity (browser-local GUID). Used by games that
  // support reattaching disconnected players to their existing seat.
  // Optional because not all games consult it.
  clientId?: string;
};

export type RelayMessage = {
  to: PlayerId[];
  payload: RelayPayload;
};

// ServerState is the union of all game states
import type { EpycState } from './games/epyc/types.js';
import type { PictionaryState } from './games/pictionary/types.js';
import type { BwcState } from './games/bwc/types.js';
export type ServerState = EpycState | PictionaryState | BwcState;

import type { ServerMessage } from './protocol.js';

export type Effect =
  | { type: 'broadcast' }
  | { type: 'relay'; messages: RelayMessage[] }
  | { type: 'send'; playerId: PlayerId; msg: ServerMessage }
  | { type: 'set-timer'; deadline: number }
  | { type: 'clear-timer' }
  | { type: 'kick'; playerId: PlayerId };

export type ReduceResult = {
  state: ServerState;
  effects: Effect[];
};
