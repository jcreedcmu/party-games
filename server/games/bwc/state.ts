import type { PlayerId, PlayerInfo, ServerState, ReduceResult } from '../../types.js';
import type { ClientMessage } from '../../protocol.js';
import type { BwcState, BwcWaitingState } from './types.js';

export function createInitialState(): BwcWaitingState {
  return {
    phase: 'bwc-waiting',
    players: new Map(),
    nextPlayerId: 1,
  };
}

export function addPlayer(
  state: BwcWaitingState,
  handle: string,
): { state: BwcWaitingState; playerId: PlayerId } {
  const playerId = String(state.nextPlayerId);
  const player: PlayerInfo = { id: playerId, handle, ready: false, connected: true };
  const players = new Map(state.players);
  players.set(playerId, player);
  return {
    state: { ...state, players, nextPlayerId: state.nextPlayerId + 1 },
    playerId,
  };
}

function removePlayer(state: BwcWaitingState, playerId: PlayerId): BwcWaitingState {
  const players = new Map(state.players);
  players.delete(playerId);
  return { ...state, players };
}

function setReady(
  state: BwcWaitingState,
  playerId: PlayerId,
  ready: boolean,
): BwcWaitingState {
  const players = new Map(state.players);
  const player = players.get(playerId);
  if (!player) return state;
  players.set(playerId, { ...player, ready });
  return { ...state, players };
}

export function bwcReduce(state: ServerState, playerId: PlayerId, msg: ClientMessage): ReduceResult {
  if (state.phase !== 'bwc-waiting') return { state, effects: [] };

  switch (msg.type) {
    case 'ready':
    case 'unready': {
      const next = setReady(state, playerId, msg.type === 'ready');
      return { state: next, effects: [{ type: 'broadcast' }] };
    }
    case 'boot': {
      if (msg.targetId === playerId) return { state, effects: [] };
      if (!state.players.has(msg.targetId)) return { state, effects: [] };
      const next = removePlayer(state, msg.targetId);
      return {
        state: next,
        effects: [{ type: 'kick', playerId: msg.targetId }, { type: 'broadcast' }],
      };
    }
    default:
      return { state, effects: [] };
  }
}

export function bwcReduceDisconnect(state: ServerState, playerId: PlayerId): ReduceResult {
  if (state.phase !== 'bwc-waiting') return { state, effects: [] };
  const next = removePlayer(state, playerId);
  return { state: next, effects: [{ type: 'broadcast' }] };
}

export function bwcReduceTimer(state: ServerState): ReduceResult {
  return { state, effects: [] };
}
