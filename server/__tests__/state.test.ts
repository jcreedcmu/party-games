import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInitialState,
  addPlayer,
  removePlayer,
  setReady,
  checkAllReady,
  submitMove,
  getClientState,
  getSheetAssignee,
  getExpectedMoveType,
  isSheetDone,
} from '../state.js';
import type { UnderwayState } from '../types.js';

describe('createInitialState', () => {
  it('returns a waiting state with no players', () => {
    const state = createInitialState();
    expect(state.phase).toBe('waiting');
    expect(state.players.size).toBe(0);
    expect(state.nextPlayerId).toBe(1);
  });
});

describe('addPlayer', () => {
  it('adds a player and returns the new state and id', () => {
    let state = createInitialState();
    const result = addPlayer(state, 'Alice');
    state = result.state;
    expect(result.playerId).toBe('1');
    expect(state.players.size).toBe(1);
    expect(state.players.get('1')?.handle).toBe('Alice');
    expect(state.players.get('1')?.ready).toBe(false);
    expect(state.players.get('1')?.connected).toBe(true);
  });

  it('increments player ids', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    const result = addPlayer(state, 'Bob');
    expect(result.playerId).toBe('2');
    expect(result.state.players.size).toBe(2);
  });
});

describe('removePlayer', () => {
  it('removes a player in waiting phase', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = addPlayer(state, 'Bob').state;
    state = removePlayer(state, '1');
    expect(state.players.size).toBe(1);
    expect(state.players.has('1')).toBe(false);
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
    state = addPlayer(state, 'Alice').state;
    state = setReady(state, '1', true);
    expect(state.players.get('1')?.ready).toBe(true);
  });

  it('sets a player as unready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = setReady(state, '1', true);
    state = setReady(state, '1', false);
    expect(state.players.get('1')?.ready).toBe(false);
  });

  it('returns state unchanged for unknown player', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    const result = setReady(state, '999', true);
    expect(result.players.get('1')?.ready).toBe(false);
  });
});

describe('checkAllReady', () => {
  it('does not transition with fewer than 2 players', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = setReady(state, '1', true);
    const result = checkAllReady(state);
    expect(result.phase).toBe('waiting');
  });

  it('does not transition if not all players are ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = addPlayer(state, 'Bob').state;
    state = setReady(state, '1', true);
    const result = checkAllReady(state);
    expect(result.phase).toBe('waiting');
  });

  it('transitions to underway when all players are ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = addPlayer(state, 'Bob').state;
    state = setReady(state, '1', true);
    state = setReady(state, '2', true);
    const result = checkAllReady(state);
    expect(result.phase).toBe('underway');
    if (result.phase !== 'underway') return;
    expect(result.sheets.length).toBe(2);
    expect(result.order.length).toBe(2);
    expect(result.order).toContain('1');
    expect(result.order).toContain('2');
  });

  it('creates sheets with valid firstMoveType', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = addPlayer(state, 'Bob').state;
    state = setReady(state, '1', true);
    state = setReady(state, '2', true);
    const result = checkAllReady(state);
    if (result.phase !== 'underway') return;
    for (const sheet of result.sheets) {
      expect(['text', 'drawing']).toContain(sheet.firstMoveType);
      expect(sheet.moves).toEqual([]);
    }
  });
});

describe('helpers', () => {
  it('getSheetAssignee follows the rotation', () => {
    const order = ['A', 'B', 'C'];
    const sheet = { originIndex: 0, firstMoveType: 'text' as const, moves: [] };
    expect(getSheetAssignee(order, sheet)).toBe('A');

    const sheet1 = { ...sheet, moves: [{ type: 'text' as const, content: 'hi', playerId: 'A' }] };
    expect(getSheetAssignee(order, sheet1)).toBe('B');

    const sheet2 = { ...sheet, moves: [
      { type: 'text' as const, content: 'hi', playerId: 'A' },
      { type: 'drawing' as const, content: 'data:...', playerId: 'B' },
    ] };
    expect(getSheetAssignee(order, sheet2)).toBe('C');
  });

  it('getExpectedMoveType alternates from firstMoveType', () => {
    const textSheet = { originIndex: 0, firstMoveType: 'text' as const, moves: [] };
    expect(getExpectedMoveType(textSheet)).toBe('text');

    const textSheet1 = { ...textSheet, moves: [{ type: 'text' as const, content: 'hi', playerId: 'A' }] };
    expect(getExpectedMoveType(textSheet1)).toBe('drawing');

    const drawingSheet = { originIndex: 0, firstMoveType: 'drawing' as const, moves: [] };
    expect(getExpectedMoveType(drawingSheet)).toBe('drawing');

    const drawingSheet1 = { ...drawingSheet, moves: [{ type: 'drawing' as const, content: 'data:...', playerId: 'A' }] };
    expect(getExpectedMoveType(drawingSheet1)).toBe('text');
  });

  it('isSheetDone', () => {
    const sheet = { originIndex: 0, firstMoveType: 'text' as const, moves: [] };
    expect(isSheetDone(sheet, 3)).toBe(false);

    const doneSheet = {
      ...sheet,
      moves: [
        { type: 'text' as const, content: 'a', playerId: '1' },
        { type: 'drawing' as const, content: 'b', playerId: '2' },
        { type: 'text' as const, content: 'c', playerId: '3' },
      ],
    };
    expect(isSheetDone(doneSheet, 3)).toBe(true);
  });
});

describe('submitMove', () => {
  it('appends a valid move', () => {
    const state = makeUnderwayState();
    // order is ['1', '2'], sheet 0 has originIndex 0 → assigned to '1'
    const assignee = getSheetAssignee(state.order, state.sheets[0]);
    const expectedType = getExpectedMoveType(state.sheets[0]);

    const result = submitMove(state, assignee, 0, {
      type: expectedType,
      content: 'hello',
    });
    expect(result.phase).toBe('underway');
    if (result.phase !== 'underway') return;
    expect(result.sheets[0].moves.length).toBe(1);
    expect(result.sheets[0].moves[0].content).toBe('hello');
  });

  it('rejects move from wrong player', () => {
    const state = makeUnderwayState();
    const assignee = getSheetAssignee(state.order, state.sheets[0]);
    const wrongPlayer = assignee === '1' ? '2' : '1';
    const expectedType = getExpectedMoveType(state.sheets[0]);

    const result = submitMove(state, wrongPlayer, 0, {
      type: expectedType,
      content: 'hello',
    });
    // State unchanged
    expect(result.sheets[0].moves.length).toBe(0);
  });

  it('rejects move of wrong type', () => {
    const state = makeUnderwayState();
    const assignee = getSheetAssignee(state.order, state.sheets[0]);
    const expectedType = getExpectedMoveType(state.sheets[0]);
    const wrongType = expectedType === 'text' ? 'drawing' : 'text';

    const result = submitMove(state, assignee, 0, {
      type: wrongType,
      content: 'hello',
    });
    expect(result.sheets[0].moves.length).toBe(0);
  });

  it('transitions to postgame when all sheets are done', () => {
    let state = makeUnderwayState();
    // Play through all moves for both sheets with 2 players
    // Each sheet needs 2 moves (one per player)
    for (let round = 0; round < 2; round++) {
      for (let si = 0; si < state.sheets.length; si++) {
        if (state.phase !== 'underway') break;
        const sheet = state.sheets[si];
        if (isSheetDone(sheet, state.order.length)) continue;
        const assignee = getSheetAssignee(state.order, sheet);
        const moveType = getExpectedMoveType(sheet);
        state = submitMove(state, assignee, si, {
          type: moveType,
          content: `move-${round}-${si}`,
        }) as UnderwayState;
      }
    }
    expect(state.phase).toBe('postgame');
  });
});

describe('getClientState', () => {
  it('returns waiting state with player list', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = addPlayer(state, 'Bob').state;
    state = setReady(state, '1', true);

    const clientState = getClientState(state, '1');
    expect(clientState.phase).toBe('waiting');
    if (clientState.phase !== 'waiting') return;
    expect(clientState.players.length).toBe(2);
    expect(clientState.players.find(p => p.id === '1')?.ready).toBe(true);
    expect(clientState.players.find(p => p.id === '2')?.ready).toBe(false);
  });

  it('returns underway state with sheet projections', () => {
    const state = makeUnderwayState();
    const clientState = getClientState(state, '1');
    expect(clientState.phase).toBe('underway');
    if (clientState.phase !== 'underway') return;
    expect(clientState.sheets.length).toBe(2);

    // Exactly one sheet should be assigned to player '1'
    const mySheets = clientState.sheets.filter(s => s.assignedToMe);
    const otherSheets = clientState.sheets.filter(s => !s.assignedToMe);
    expect(mySheets.length).toBe(1);
    expect(otherSheets.length).toBe(1);

    // My sheet should have expectedMoveType and previousMove
    const mySheet = mySheets[0];
    if (!mySheet.assignedToMe) return;
    expect(['text', 'drawing']).toContain(mySheet.expectedMoveType);
    expect(mySheet.previousMove).toBeNull();
  });

  it('does not leak previous move data for sheets not assigned to player', () => {
    const state = makeUnderwayState();
    const clientState = getClientState(state, '1');
    if (clientState.phase !== 'underway') return;

    const otherSheets = clientState.sheets.filter(s => !s.assignedToMe);
    for (const sheet of otherSheets) {
      expect(sheet).not.toHaveProperty('previousMove');
      expect(sheet).not.toHaveProperty('expectedMoveType');
    }
  });

  it('returns postgame state with full sheets', () => {
    let state = makeUnderwayState();
    // Play to completion
    for (let round = 0; round < 2; round++) {
      for (let si = 0; si < state.sheets.length; si++) {
        if (state.phase !== 'underway') break;
        const sheet = state.sheets[si];
        if (isSheetDone(sheet, state.order.length)) continue;
        const assignee = getSheetAssignee(state.order, sheet);
        const moveType = getExpectedMoveType(sheet);
        state = submitMove(state, assignee, si, {
          type: moveType,
          content: `content-${round}-${si}`,
        }) as UnderwayState;
      }
    }
    expect(state.phase).toBe('postgame');

    const clientState = getClientState(state, '1');
    expect(clientState.phase).toBe('postgame');
    if (clientState.phase !== 'postgame') return;
    expect(clientState.sheets.length).toBe(2);
    for (const sheet of clientState.sheets) {
      expect(sheet.moves.length).toBe(2);
      for (const move of sheet.moves) {
        expect(move.playerHandle).toBeTruthy();
      }
    }
  });
});

// --- Test helper ---

/** Creates a deterministic underway state with 2 players and fixed order. */
function makeUnderwayState(): UnderwayState {
  const players = new Map([
    ['1', { id: '1', handle: 'Alice', ready: false, connected: true }],
    ['2', { id: '2', handle: 'Bob', ready: false, connected: true }],
  ]);
  return {
    phase: 'underway',
    players,
    order: ['1', '2'],
    sheets: [
      { originIndex: 0, firstMoveType: 'text', moves: [] },
      { originIndex: 1, firstMoveType: 'drawing', moves: [] },
    ],
  };
}
