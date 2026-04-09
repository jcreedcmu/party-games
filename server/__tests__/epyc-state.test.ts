import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  addPlayer,
  removePlayer,
  setReady,
  checkAllReady,
  submitMove,
  checkRoundComplete,
  advanceRound,
  resetGame,
  getExpectedMoveType,
  getSheetIndexForPlayer,
  ROUND_DURATION_MS,
} from '../games/epyc/state.js';
import { getClientState } from '../games/epyc/client-state.js';
import type { EpycUnderwayState } from '../games/epyc/types.js';

describe('createInitialState', () => {
  it('returns a waiting state with no players', () => {
    const state = createInitialState();
    expect(state.phase).toBe('epyc-waiting');
    expect(state.players.size).toBe(0);
    expect(state.nextPlayerId).toBe(1);
  });
});

describe('addPlayer', () => {
  it('adds a player and returns the new state and id', () => {
    const result = addPlayer(createInitialState(), 'Alice', 'cid-Alice');
    expect(result.playerId).toBe('1');
    expect(result.state.players.size).toBe(1);
    expect(result.state.players.get('1')?.handle).toBe('Alice');
  });

  it('increments player ids', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    const result = addPlayer(state, 'Bob', 'cid-Bob');
    expect(result.playerId).toBe('2');
    expect(result.state.players.size).toBe(2);
  });
});

describe('removePlayer', () => {
  it('removes a player in waiting phase', () => {
    let waitState = createInitialState();
    waitState = addPlayer(waitState, 'Alice', 'cid-Alice').state;
    waitState = addPlayer(waitState, 'Bob', 'cid-Bob').state;
    const result = removePlayer(waitState, '1');
    expect(result.players.size).toBe(1);
    expect(result.players.has('1')).toBe(false);
  });

  it('marks player as disconnected in underway phase', () => {
    const state = makeUnderwayState();
    const result = removePlayer(state, '1');
    expect(result.players.get('1')?.connected).toBe(false);
    expect(result.players.size).toBe(2);
  });
});

describe('setReady', () => {
  it('sets a player as ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = setReady(state, '1', true);
    expect(state.players.get('1')?.ready).toBe(true);
  });

  it('sets a player as unready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = setReady(state, '1', true);
    state = setReady(state, '1', false);
    expect(state.players.get('1')?.ready).toBe(false);
  });

  it('returns state unchanged for unknown player', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    const result = setReady(state, '999', true);
    expect(result.players.get('1')?.ready).toBe(false);
  });
});

describe('checkAllReady', () => {
  it('does not transition with fewer than 2 players', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = setReady(state, '1', true);
    expect(checkAllReady(state).phase).toBe('epyc-waiting');
  });

  it('does not transition if not all players are ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = addPlayer(state, 'Bob', 'cid-Bob').state;
    state = setReady(state, '1', true);
    expect(checkAllReady(state).phase).toBe('epyc-waiting');
  });

  it('transitions to underway when all players are ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = addPlayer(state, 'Bob', 'cid-Bob').state;
    state = setReady(state, '1', true);
    state = setReady(state, '2', true);
    const result = checkAllReady(state);
    expect(result.phase).toBe('epyc-underway');
    if (result.phase !== 'epyc-underway') return;
    expect(result.sheets.length).toBe(2);
    expect(result.order.length).toBe(2);
    expect(result.currentRound).toBe(0);
    expect(['text', 'drawing']).toContain(result.firstMoveType);
    expect(result.submittedThisRound.size).toBe(0);
  });
});

describe('helpers', () => {
  it('getExpectedMoveType alternates each round', () => {
    expect(getExpectedMoveType('text', 0)).toBe('text');
    expect(getExpectedMoveType('text', 1)).toBe('drawing');
    expect(getExpectedMoveType('text', 2)).toBe('text');
    expect(getExpectedMoveType('drawing', 0)).toBe('drawing');
    expect(getExpectedMoveType('drawing', 1)).toBe('text');
  });

  it('getSheetIndexForPlayer rotates sheets correctly', () => {
    const order = ['A', 'B', 'C'];
    // Round 0: A→sheet0, B→sheet1, C→sheet2
    expect(getSheetIndexForPlayer(order, 'A', 0)).toBe(0);
    expect(getSheetIndexForPlayer(order, 'B', 0)).toBe(1);
    expect(getSheetIndexForPlayer(order, 'C', 0)).toBe(2);
    // Round 1: sheets rotate → A→sheet2, B→sheet0, C→sheet1
    expect(getSheetIndexForPlayer(order, 'A', 1)).toBe(2);
    expect(getSheetIndexForPlayer(order, 'B', 1)).toBe(0);
    expect(getSheetIndexForPlayer(order, 'C', 1)).toBe(1);
  });
});

describe('submitMove', () => {
  it('records a move on the correct sheet', () => {
    const state = makeUnderwayState();
    const result = submitMove(state, '1', { type: 'text', content: 'hello' });
    // Player '1' is order[0], round 0 → sheet 0
    expect(result.sheets[0].moves.length).toBe(1);
    expect(result.sheets[0].moves[0]?.content).toBe('hello');
    expect(result.submittedThisRound.has('1')).toBe(true);
  });

  it('rejects double submission', () => {
    let state = makeUnderwayState();
    state = submitMove(state, '1', { type: 'text', content: 'hello' });
    const result = submitMove(state, '1', { type: 'text', content: 'again' });
    expect(result.sheets[0].moves.length).toBe(1);
  });

  it('rejects wrong move type', () => {
    const state = makeUnderwayState(); // firstMoveType is 'text'
    const result = submitMove(state, '1', { type: 'drawing', content: 'data:...' });
    expect(result.sheets[0].moves.length).toBe(0);
  });
});

describe('checkRoundComplete', () => {
  it('does not advance if not all players have submitted', () => {
    let state = makeUnderwayState();
    state = submitMove(state, '1', { type: 'text', content: 'hello' });
    const result = checkRoundComplete(state);
    expect(result.phase).toBe('epyc-underway');
    if (result.phase === 'epyc-underway') {
      expect(result.currentRound).toBe(0);
    }
  });

  it('advances when all players have submitted', () => {
    let state = makeUnderwayState();
    state = submitMove(state, '1', { type: 'text', content: 'hello' });
    state = submitMove(state, '2', { type: 'text', content: 'world' });
    const result = checkRoundComplete(state);
    expect(result.phase).toBe('epyc-underway');
    if (result.phase === 'epyc-underway') {
      expect(result.currentRound).toBe(1);
      expect(result.submittedThisRound.size).toBe(0);
    }
  });

  it('advances when remaining connected players have submitted', () => {
    let state = makeUnderwayState();
    // Disconnect player 2
    state = removePlayer(state, '2') as EpycUnderwayState;
    // Player 1 submits
    state = submitMove(state, '1', { type: 'text', content: 'hello' });
    const result = checkRoundComplete(state);
    // Should advance since disconnected player is accounted for
    if (result.phase === 'epyc-underway') {
      expect(result.currentRound).toBe(1);
    }
  });
});

describe('advanceRound', () => {
  it('fills null for missing submissions', () => {
    const state = makeUnderwayState();
    // No one submitted, advance via timer
    const result = advanceRound(state);
    if (result.phase === 'epyc-underway') {
      // Both sheets should have a null entry
      expect(result.sheets[0].moves[0]).toBeNull();
      expect(result.sheets[1].moves[0]).toBeNull();
    }
  });

  it('transitions to postgame after all rounds', () => {
    let state = makeUnderwayState();
    // Play through 2 rounds (2 players = 2 rounds)
    state = submitMove(state, '1', { type: 'text', content: 'r0-p1' });
    state = submitMove(state, '2', { type: 'text', content: 'r0-p2' });
    state = checkRoundComplete(state) as EpycUnderwayState;
    expect(state.phase).toBe('epyc-underway');
    if (state.phase !== 'epyc-underway') return;
    expect(state.currentRound).toBe(1);

    const moveType = getExpectedMoveType(state.firstMoveType, 1);
    state = submitMove(state, '1', { type: moveType, content: 'r1-p1' });
    state = submitMove(state, '2', { type: moveType, content: 'r1-p2' });
    const result = checkRoundComplete(state);
    expect(result.phase).toBe('epyc-postgame');
  });
});

describe('getClientState', () => {
  it('returns waiting state with player list', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = setReady(state, '1', true);
    const cs = getClientState(state, '1');
    expect(cs.phase).toBe('epyc-waiting');
    if (cs.phase === 'epyc-waiting') {
      expect(cs.players[0].ready).toBe(true);
    }
  });

  it('returns underway state with round info and sheet', () => {
    const state = makeUnderwayState();
    const cs = getClientState(state, '1');
    expect(cs.phase).toBe('epyc-underway');
    if (cs.phase !== 'epyc-underway') return;
    expect(cs.currentRound).toBe(0);
    expect(cs.totalRounds).toBe(2);
    expect(cs.expectedMoveType).toBe('text');
    expect(cs.submitted).toBe(false);
    expect(cs.previousMove).toBeNull(); // first round, no previous
  });

  it('shows submitted=true after submitting', () => {
    let state = makeUnderwayState();
    state = submitMove(state, '1', { type: 'text', content: 'hi' });
    const cs = getClientState(state, '1');
    if (cs.phase === 'epyc-underway') {
      expect(cs.submitted).toBe(true);
    }
  });

  it('shows previous move from prior round', () => {
    let state = makeUnderwayState();
    state = submitMove(state, '1', { type: 'text', content: 'hello' });
    state = submitMove(state, '2', { type: 'text', content: 'world' });
    state = checkRoundComplete(state) as EpycUnderwayState;
    // Round 1: player 2 now has sheet 0 (which has 'hello' from player 1)
    const cs = getClientState(state, '2');
    if (cs.phase === 'epyc-underway') {
      expect(cs.previousMove).toEqual({ type: 'text', content: 'hello' });
    }
  });

  it('returns postgame with full sheets', () => {
    let state = makeUnderwayState();
    state = submitMove(state, '1', { type: 'text', content: 'r0' });
    state = submitMove(state, '2', { type: 'text', content: 'r0' });
    state = checkRoundComplete(state) as EpycUnderwayState;
    const moveType = getExpectedMoveType('text', 1);
    state = submitMove(state, '1', { type: moveType, content: 'r1' });
    state = submitMove(state, '2', { type: moveType, content: 'r1' });
    const result = checkRoundComplete(state);
    expect(result.phase).toBe('epyc-postgame');
    const cs = getClientState(result, '1');
    if (cs.phase === 'epyc-postgame') {
      expect(cs.sheets.length).toBe(2);
      expect(cs.sheets[0].moves.length).toBe(2);
    }
  });
});

describe('resetGame', () => {
  it('returns to waiting phase with connected players', () => {
    let state = makeUnderwayState();
    state = removePlayer(state, '2') as EpycUnderwayState;
    const result = resetGame(state);
    expect(result.phase).toBe('epyc-waiting');
    expect(result.players.size).toBe(1);
    expect(result.players.has('1')).toBe(true);
    expect(result.players.has('2')).toBe(false);
    expect(result.players.get('1')?.ready).toBe(false);
  });

  it('sets nextPlayerId higher than existing ids', () => {
    const state = makeUnderwayState();
    const result = resetGame(state);
    expect(result.nextPlayerId).toBe(3);
  });
});

// --- Test helper ---

function makeUnderwayState(): EpycUnderwayState {
  const players = new Map([
    ['1', { id: '1', handle: 'Alice', ready: false, connected: true }],
    ['2', { id: '2', handle: 'Bob', ready: false, connected: true }],
  ]);
  return {
    phase: 'epyc-underway',
    players,
    order: ['1', '2'],
    sheets: [
      { originIndex: 0, moves: [] },
      { originIndex: 1, moves: [] },
    ],
    currentRound: 0,
    firstMoveType: 'text',
    roundDeadline: Date.now() + ROUND_DURATION_MS,
    submittedThisRound: new Set(),
  };
}
