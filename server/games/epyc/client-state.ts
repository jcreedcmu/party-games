import type { PlayerId, MoveType } from '../../types.js';
import type { EpycState } from './types.js';
import { getExpectedMoveType, getSheetIndexForPlayer } from './state.js';

export type EpycClientPlayerInfo = {
  id: string;
  handle: string;
  ready: boolean;
  connected: boolean;
};

export type EpycClientWaitingState = {
  phase: 'epyc-waiting';
  players: EpycClientPlayerInfo[];
};

export type EpycClientUnderwayPlayer = EpycClientPlayerInfo & { submitted: boolean };

export type EpycClientUnderwayState = {
  phase: 'epyc-underway';
  players: EpycClientUnderwayPlayer[];
  currentRound: number;
  totalRounds: number;
  expectedMoveType: MoveType;
  roundDeadline: number;
  submitted: boolean;
  previousMove: { type: MoveType; content: string } | null;
};

export type EpycClientFullSheet = {
  sheetIndex: number;
  moves: ({ type: MoveType; content: string; playerHandle: string } | null)[];
};

export type EpycClientPostgameState = {
  phase: 'epyc-postgame';
  players: { id: string; handle: string }[];
  sheets: EpycClientFullSheet[];
};

export type EpycClientState =
  | EpycClientWaitingState
  | EpycClientUnderwayState
  | EpycClientPostgameState;

export function getClientState(state: EpycState, playerId: PlayerId): EpycClientState {
  switch (state.phase) {
    case 'epyc-waiting':
      return {
        phase: 'epyc-waiting',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id, handle: p.handle, ready: p.ready, connected: p.connected,
        })),
      };

    case 'epyc-underway': {
      const sheetIndex = getSheetIndexForPlayer(state.order, playerId, state.currentRound);
      const sheet = state.sheets[sheetIndex];
      const lastEntry = sheet.moves.length > 0 ? sheet.moves[sheet.moves.length - 1] : null;
      const previousMove = lastEntry
        ? { type: lastEntry.type, content: lastEntry.content }
        : null;

      return {
        phase: 'epyc-underway',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id, handle: p.handle, ready: false, connected: p.connected,
          submitted: state.submittedThisRound.has(p.id),
        })),
        currentRound: state.currentRound,
        totalRounds: state.order.length,
        expectedMoveType: getExpectedMoveType(state.firstMoveType, state.currentRound),
        roundDeadline: state.roundDeadline,
        submitted: state.submittedThisRound.has(playerId),
        previousMove,
      };
    }

    case 'epyc-postgame':
      return {
        phase: 'epyc-postgame',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id, handle: p.handle,
        })),
        sheets: state.sheets.map((sheet, i) => ({
          sheetIndex: i,
          moves: sheet.moves.map(m =>
            m ? { type: m.type, content: m.content, playerHandle: state.players.get(m.playerId)?.handle ?? 'Unknown' }
              : null
          ),
        })),
      };
  }
}
