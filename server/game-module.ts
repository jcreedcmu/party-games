import type { PlayerId, ServerState, ReduceResult, GameType } from './types.js';
import type { ClientMessage, ClientGameState } from './protocol.js';

import {
  createInitialState as epycCreateInitialState,
  addPlayer as epycAddPlayer,
  epycReduce,
  epycReduceDisconnect,
  epycReduceTimer,
} from './games/epyc/state.js';
import { getClientState as epycGetClientState } from './games/epyc/client-state.js';

import {
  createInitialState as picCreateInitialState,
  addPlayer as picAddPlayer,
  pictionaryReduce,
  pictionaryReduceDisconnect,
  pictionaryReduceTimer,
} from './games/pictionary/state.js';
import { getClientState as picGetClientState } from './games/pictionary/client-state.js';

import {
  createInitialState as bwcCreateInitialState,
  addPlayer as bwcAddPlayer,
  bwcReduce,
  bwcReduceDisconnect,
  bwcReduceTimer,
} from './games/bwc/state.js';
import { getClientState as bwcGetClientState } from './games/bwc/client-state.js';

export type GameModule = {
  createInitialState: () => ServerState;
  addPlayer: (state: ServerState, handle: string, clientId: string) => { state: ServerState; playerId: PlayerId } | null;
  getClientState: (state: ServerState, playerId: PlayerId) => ClientGameState;
  reduce: (state: ServerState, playerId: PlayerId, msg: ClientMessage) => ReduceResult;
  reduceDisconnect: (state: ServerState, playerId: PlayerId) => ReduceResult;
  reduceTimer: (state: ServerState) => ReduceResult;
};

export const epycModule: GameModule = {
  createInitialState: epycCreateInitialState,
  addPlayer(state, handle, clientId) {
    if (state.phase !== 'epyc-waiting') return null;
    return epycAddPlayer(state, handle, clientId);
  },
  getClientState(state, playerId) {
    if (state.phase !== 'epyc-waiting' && state.phase !== 'epyc-underway' && state.phase !== 'epyc-postgame') {
      throw new Error(`epycModule.getClientState called with phase ${state.phase}`);
    }
    return epycGetClientState(state, playerId);
  },
  reduce: epycReduce,
  reduceDisconnect: epycReduceDisconnect,
  reduceTimer: epycReduceTimer,
};

export const pictionaryModule: GameModule = {
  createInitialState: picCreateInitialState,
  addPlayer(state, handle, clientId) {
    if (state.phase !== 'pictionary-waiting' && state.phase !== 'pictionary-active' && state.phase !== 'pictionary-postgame') return null;
    return picAddPlayer(state, handle, clientId);
  },
  getClientState(state, playerId) {
    if (state.phase !== 'pictionary-waiting' && state.phase !== 'pictionary-active' && state.phase !== 'pictionary-postgame') {
      throw new Error(`pictionaryModule.getClientState called with phase ${state.phase}`);
    }
    return picGetClientState(state, playerId);
  },
  reduce: pictionaryReduce,
  reduceDisconnect: pictionaryReduceDisconnect,
  reduceTimer: pictionaryReduceTimer,
};

export const bwcModule: GameModule = {
  createInitialState: bwcCreateInitialState,
  addPlayer(state, handle, clientId) {
    if (state.phase !== 'bwc-waiting') return null;
    return bwcAddPlayer(state, handle, clientId);
  },
  getClientState(state, playerId) {
    if (state.phase !== 'bwc-waiting') {
      throw new Error(`bwcModule.getClientState called with phase ${state.phase}`);
    }
    return bwcGetClientState(state, playerId);
  },
  reduce: bwcReduce,
  reduceDisconnect: bwcReduceDisconnect,
  reduceTimer: bwcReduceTimer,
};

const gameModules: Record<GameType, GameModule> = {
  epyc: epycModule,
  pictionary: pictionaryModule,
  bwc: bwcModule,
};

export function getGameModule(gameType: GameType): GameModule {
  return gameModules[gameType];
}
