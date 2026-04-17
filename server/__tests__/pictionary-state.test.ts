import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  addPlayer,
  removePlayer,
  setReady,
  checkAllReady,
  checkAllReadyPostgame,
  getCurrentDrawer,
  recordDrawOp,
  selectWord,
  advanceTurn,
  resetGame,
  TURN_DURATION_MS,
} from '../games/pictionary/state.js';
import type { PictionaryActiveState, PictionaryPostgameState } from '../games/pictionary/types.js';
import {
  setupWords,
  makeTwoPlayerActive,
  makeTwoPlayerDrawing,
  makeTwoPlayerPostgame,
  makeThreePlayerDrawing,
} from './pictionary-helpers.js';

setupWords();

describe('createInitialState', () => {
  it('returns a waiting state with no players', () => {
    const state = createInitialState();
    expect(state.phase).toBe('pictionary-waiting');
    expect(state.players.size).toBe(0);
    expect(state.nextPlayerId).toBe(1);
  });
});

describe('addPlayer', () => {
  it('adds a player and returns the new state and id', () => {
    const result = addPlayer(createInitialState(), 'Alice', 'cid-Alice');
    expect(result.playerId).toBe('1');
    expect(result.state.players.size).toBe(1);
    expect(result.state.players.get('1')!.handle).toBe('Alice');
  });

  it('increments nextPlayerId', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    const result = addPlayer(state, 'Bob', 'cid-Bob');
    expect(result.playerId).toBe('2');
    expect(result.state.nextPlayerId).toBe(3);
  });
});

describe('removePlayer', () => {
  it('deletes the player in waiting phase', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    const result = removePlayer(state, '1');
    expect(result.players.size).toBe(0);
  });

  it('marks the player as disconnected in active phase', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const result = removePlayer(active, drawerId);
    expect(result.players.get(drawerId)!.connected).toBe(false);
    expect(result.players.size).toBe(2);
  });
});

describe('setReady', () => {
  it('marks a player as ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = setReady(state, '1', true);
    expect(state.players.get('1')!.ready).toBe(true);
  });
});

describe('checkAllReady', () => {
  it('does not start with fewer than 2 players', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = setReady(state, '1', true);
    expect(checkAllReady(state).phase).toBe('pictionary-waiting');
  });

  it('does not start if not all players are ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
    state = addPlayer(state, 'Bob', 'cid-Bob').state;
    state = setReady(state, '1', true);
    expect(checkAllReady(state).phase).toBe('pictionary-waiting');
  });

  it('starts the game in picking sub-phase when all players are ready', () => {
    const active = makeTwoPlayerActive();
    expect(active.phase).toBe('pictionary-active');
    expect(active.subPhase).toBe('picking');
    expect(active.order.length).toBe(2);
    expect(active.currentTurnIndex).toBe(0);
    expect(active.wordChoices.length).toBe(3);
    expect(active.word).toBe('');
    expect(active.scores.size).toBe(2);
    expect(active.correctGuessers).toEqual([]);
    expect(active.currentTurnOps).toEqual([]);
    expect(active.completedTurns).toEqual([]);
  });

  it('starts the game when an unready player leaves and the rest are ready', () => {
    let state = createInitialState();
    const r1 = addPlayer(state, 'Alice', 'cid-Alice');
    state = r1.state;
    const r2 = addPlayer(state, 'Bob', 'cid-Bob');
    state = r2.state;
    const r3 = addPlayer(state, 'Carol', 'cid-Carol');
    state = r3.state;
    state = setReady(state, r1.playerId, true);
    state = setReady(state, r2.playerId, true);
    const afterRemove = removePlayer(state, r3.playerId);
    const next = checkAllReady(afterRemove as typeof state);
    expect(next.phase).toBe('pictionary-active');
  });
});

describe('selectWord', () => {
  it('transitions from picking to drawing with chosen word', () => {
    const active = makeTwoPlayerActive();
    expect(active.subPhase).toBe('picking');
    const chosenWord = active.wordChoices[1];
    const result = selectWord(active, 1);
    expect(result.subPhase).toBe('drawing');
    expect(result.word).toBe(chosenWord);
    expect(result.wordChoices).toEqual([]);
  });

  it('sets turnDeadline and turnStartTime for drawing phase', () => {
    const active = makeTwoPlayerActive();
    const before = Date.now();
    const result = selectWord(active, 0);
    const after = Date.now();
    expect(result.turnDeadline).toBeGreaterThanOrEqual(before + TURN_DURATION_MS);
    expect(result.turnDeadline).toBeLessThanOrEqual(after + TURN_DURATION_MS);
    expect(result.turnStartTime).toBeGreaterThanOrEqual(before);
    expect(result.turnStartTime).toBeLessThanOrEqual(after);
  });

  it('ignores invalid choice index', () => {
    const active = makeTwoPlayerActive();
    expect(selectWord(active, -1)).toBe(active);
    expect(selectWord(active, 99)).toBe(active);
  });

  it('ignores if already in drawing sub-phase', () => {
    const drawing = makeTwoPlayerDrawing();
    expect(selectWord(drawing, 0)).toBe(drawing);
  });
});

describe('getCurrentDrawer', () => {
  it('returns the player at currentTurnIndex', () => {
    const active = makeTwoPlayerActive();
    expect(getCurrentDrawer(active)).toBe(active.order[0]);
  });
});

describe('recordDrawOp', () => {
  it('appends a draw op to currentTurnOps with timestamp', () => {
    const active = makeTwoPlayerDrawing();
    const op = { type: 'draw-start' as const, color: '#000', size: 5, x: 10, y: 20 };
    const result = recordDrawOp(active, op);
    expect(result.currentTurnOps).toHaveLength(1);
    expect(result.currentTurnOps[0]).toMatchObject(op);
    expect(result.currentTurnOps[0]).toHaveProperty('t');
    expect(typeof result.currentTurnOps[0].t).toBe('number');
    const op2 = { type: 'draw-end' as const };
    const result2 = recordDrawOp(result, op2);
    expect(result2.currentTurnOps).toHaveLength(2);
    expect(result2.currentTurnOps[1]).toMatchObject(op2);
  });
});

describe('advanceTurn', () => {
  it('saves the completed turn and starts a new turn in picking', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const word = active.word;
    const result = advanceTurn(active);
    if (result.phase !== 'pictionary-active') throw new Error('Expected active');
    expect(result.completedTurns.length).toBe(1);
    expect(result.completedTurns[0].drawerId).toBe(drawerId);
    expect(result.completedTurns[0].word).toBe(word);
    expect(result.currentTurnIndex).toBe(1);
    expect(result.subPhase).toBe('picking');
    expect(result.wordChoices.length).toBe(3);
    expect(result.word).toBe('');
    expect(result.correctGuessers).toEqual([]);
    expect(result.currentTurnOps).toEqual([]);
  });

  it('goes to postgame after all rounds', () => {
    let next: PictionaryActiveState | PictionaryPostgameState = makeTwoPlayerDrawing();
    while (next.phase === 'pictionary-active') {
      next = advanceTurn(next);
      if (next.phase === 'pictionary-active') {
        next = selectWord(next, 0);
      }
    }
    expect(next.phase).toBe('pictionary-postgame');
    if (next.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
    expect(next.turns.length).toBe(6);
  });

  it('skips disconnected drawers', () => {
    const { state, ids } = makeThreePlayerDrawing();
    const nextDrawerIndex = state.currentTurnIndex + 1;
    if (nextDrawerIndex >= state.order.length) throw new Error('Need at least 3 players');
    const nextDrawerId = state.order[nextDrawerIndex];
    const afterDisconnect = removePlayer(state, nextDrawerId) as PictionaryActiveState;
    const result = advanceTurn(afterDisconnect);
    if (result.phase !== 'pictionary-active') throw new Error('Expected active');
    expect(result.currentTurnIndex).toBeGreaterThan(nextDrawerIndex);
    const newDrawer = getCurrentDrawer(result);
    expect(result.players.get(newDrawer)!.connected).toBe(true);
  });
});

describe('resetGame', () => {
  it('returns to waiting with connected players', () => {
    const postgame = makeTwoPlayerPostgame();
    const waiting = resetGame(postgame);
    expect(waiting.phase).toBe('pictionary-waiting');
    expect(waiting.players.size).toBe(2);
    for (const [, p] of waiting.players) {
      expect(p.ready).toBe(false);
    }
  });

  it('excludes disconnected players on reset', () => {
    let next: PictionaryActiveState | PictionaryPostgameState = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(next);
    next = removePlayer(next, drawerId) as PictionaryActiveState;
    while (next.phase === 'pictionary-active') {
      next = advanceTurn(next);
      if (next.phase === 'pictionary-active') {
        next = selectWord(next, 0);
      }
    }
    if (next.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
    const waiting = resetGame(next);
    expect(waiting.players.size).toBe(1);
    expect(waiting.players.has(drawerId)).toBe(false);
  });
});

describe('setReady on postgame', () => {
  it('marks a player as ready in postgame', () => {
    const postgame = makeTwoPlayerPostgame();
    const playerId = Array.from(postgame.players.keys())[0];
    const updated = setReady(postgame, playerId, true);
    expect(updated.phase).toBe('pictionary-postgame');
    expect(updated.players.get(playerId)!.ready).toBe(true);
  });

  it('marks a player as unready in postgame', () => {
    const postgame = makeTwoPlayerPostgame();
    const playerId = Array.from(postgame.players.keys())[0];
    let updated = setReady(postgame, playerId, true);
    updated = setReady(updated, playerId, false);
    expect(updated.players.get(playerId)!.ready).toBe(false);
  });
});

describe('checkAllReadyPostgame', () => {
  it('does not start with only one connected player ready', () => {
    const postgame = makeTwoPlayerPostgame();
    const playerId = Array.from(postgame.players.keys())[0];
    const updated = setReady(postgame, playerId, true);
    expect(checkAllReadyPostgame(updated).phase).toBe('pictionary-postgame');
  });

  it('starts a new game when all connected players are ready', () => {
    let postgame = makeTwoPlayerPostgame();
    for (const id of postgame.players.keys()) {
      postgame = setReady(postgame, id, true);
    }
    const result = checkAllReadyPostgame(postgame);
    expect(result.phase).toBe('pictionary-active');
    if (result.phase !== 'pictionary-active') throw new Error();
    expect(result.subPhase).toBe('picking');
    expect(result.scores.size).toBe(2);
  });

  it('ignores disconnected players for quorum', () => {
    let postgame = makeTwoPlayerPostgame();
    const ids = Array.from(postgame.players.keys());
    postgame = removePlayer(postgame, ids[1]) as PictionaryPostgameState;
    postgame = setReady(postgame, ids[0], true);
    expect(checkAllReadyPostgame(postgame).phase).toBe('pictionary-postgame');
  });

  it('resets ready flags on all players when starting new game', () => {
    let postgame = makeTwoPlayerPostgame();
    for (const id of postgame.players.keys()) {
      postgame = setReady(postgame, id, true);
    }
    const result = checkAllReadyPostgame(postgame);
    if (result.phase !== 'pictionary-active') throw new Error();
    for (const [, p] of result.players) {
      expect(p.ready).toBe(false);
    }
  });
});
