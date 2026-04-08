import type { PlayerId, PlayerInfo } from '../../types.js';

// Step 1 only defines the waiting phase. The full data model (cards,
// surfaces, hands, scores, etc.) lands in step 2.

export type BwcWaitingState = {
  phase: 'bwc-waiting';
  players: Map<PlayerId, PlayerInfo>;
  nextPlayerId: number;
};

export type BwcState = BwcWaitingState;
