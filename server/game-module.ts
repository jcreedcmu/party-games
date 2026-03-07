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

export type GameModule = {
  createInitialState: () => ServerState;
  addPlayer: (state: ServerState, handle: string) => { state: ServerState; playerId: PlayerId } | null;
  getClientState: (state: ServerState, playerId: PlayerId) => ClientGameState;
  reduce: (state: ServerState, playerId: PlayerId, msg: ClientMessage) => ReduceResult;
  reduceDisconnect: (state: ServerState, playerId: PlayerId) => ReduceResult;
  reduceTimer: (state: ServerState) => ReduceResult;
};

export const epycModule: GameModule = {
  createInitialState: epycCreateInitialState,
  addPlayer(state, handle) {
    if (state.phase !== 'epyc-waiting') return null;
    return epycAddPlayer(state, handle);
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
  addPlayer(state, handle) {
    if (state.phase !== 'pictionary-waiting') return null;
    return picAddPlayer(state, handle);
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

const gameModules: Record<GameType, GameModule> = {
  epyc: epycModule,
  pictionary: pictionaryModule,
};

export function getGameModule(gameType: GameType): GameModule {
  return gameModules[gameType];
}
