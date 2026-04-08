import type { PlayerId } from '../../types.js';
import type { BwcState } from './types.js';

export type BwcClientWaitingState = {
  phase: 'bwc-waiting';
  players: Array<{ id: string; handle: string; ready: boolean; connected: boolean }>;
};

export type BwcClientState = BwcClientWaitingState;

export function getClientState(state: BwcState, _playerId: PlayerId): BwcClientState {
  return {
    phase: 'bwc-waiting',
    players: Array.from(state.players.values()).map(p => ({
      id: p.id,
      handle: p.handle,
      ready: p.ready,
      connected: p.connected,
    })),
  };
}
