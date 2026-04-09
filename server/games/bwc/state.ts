import type { PlayerId, PlayerInfo, ServerState, ReduceResult } from '../../types.js';
import type { ClientMessage } from '../../protocol.js';
import type { BwcState, BwcWaitingState } from './types.js';

export function createInitialState(): BwcWaitingState {
  return {
    phase: 'bwc-waiting',
    players: new Map(),
    nextPlayerId: 1,
    library: new Map(),
  };
}

export function addPlayer(
  state: BwcWaitingState,
  handle: string,
  clientId: string,
): { state: BwcWaitingState; playerId: PlayerId } {
  // If a player with this clientId already exists, reattach them:
  // mark them connected, update their handle, return their existing
  // playerId. This is the "match-always" identity rule for BWC.
  for (const [existingId, p] of state.players) {
    if (p.clientId === clientId) {
      const players = new Map(state.players);
      players.set(existingId, { ...p, handle, connected: true });
      return {
        state: { ...state, players },
        playerId: existingId,
      };
    }
  }

  const playerId = String(state.nextPlayerId);
  const player: PlayerInfo = { id: playerId, handle, ready: false, connected: true, clientId };
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

function markDisconnected(state: BwcWaitingState, playerId: PlayerId): BwcWaitingState {
  const players = new Map(state.players);
  const p = players.get(playerId);
  if (!p) return state;
  players.set(playerId, { ...p, connected: false });
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
  // Don't remove — mark disconnected so the player can reattach by
  // clientId. The orchestrator will wipe state entirely if no clients
  // remain.
  const next = markDisconnected(state, playerId);
  return { state: next, effects: [{ type: 'broadcast' }] };
}

export function bwcReduceTimer(state: ServerState): ReduceResult {
  return { state, effects: [] };
}
