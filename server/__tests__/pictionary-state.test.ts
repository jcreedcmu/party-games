import { describe, it, expect, beforeAll } from 'vitest';
import {
  createInitialState,
  addPlayer,
  removePlayer,
  setReady,
  checkAllReady,
  checkAllReadyPostgame,
  getCurrentDrawer,
  recordDrawOp,
  submitGuess,
  checkTurnComplete,
  advanceTurn,
  resetGame,
  shortenDeadline,
  selectWord,
  TURN_DURATION_MS,
  ALL_GUESSED_GRACE_MS,
  PICK_DURATION_MS,
} from '../games/pictionary/state.js';
import { getClientState } from '../games/pictionary/client-state.js';
import { configureWords } from '../games/pictionary/words.js';
import type { PictionaryActiveState, PictionaryPostgameState } from '../games/pictionary/types.js';

beforeAll(() => {
  configureWords([
    { word: 'cat' }, { word: 'dog' }, { word: 'fish' },
    { word: 'bird' }, { word: 'tree' }, { word: 'sun' },
    { word: 'moon' }, { word: 'star' }, { word: 'rain' },
    { word: 'snow' },
  ]);
});

function makeTwoPlayerPostgame(): PictionaryPostgameState {
  let active = makeTwoPlayerDrawing();
  let next = advanceTurn(active);
  if (next.phase === 'pictionary-active') {
    next = selectWord(next, 0);
    next = advanceTurn(next);
  }
  if (next.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
  return next;
}

function makeTwoPlayerActive(): PictionaryActiveState {
  let state = createInitialState();
  const r1 = addPlayer(state, 'Alice');
  state = r1.state;
  const r2 = addPlayer(state, 'Bob');
  state = r2.state;
  state = setReady(state, r1.playerId, true);
  state = setReady(state, r2.playerId, true);
  const active = checkAllReady(state);
  if (active.phase !== 'pictionary-active') throw new Error('Expected active');
  return active;
}

function makeTwoPlayerDrawing(): PictionaryActiveState {
  const active = makeTwoPlayerActive();
  return selectWord(active, 0);
}

function makeThreePlayerActive() {
  let state = createInitialState();
  const r1 = addPlayer(state, 'Alice');
  state = r1.state;
  const r2 = addPlayer(state, 'Bob');
  state = r2.state;
  const r3 = addPlayer(state, 'Carol');
  state = r3.state;
  state = setReady(state, r1.playerId, true);
  state = setReady(state, r2.playerId, true);
  state = setReady(state, r3.playerId, true);
  const active = checkAllReady(state);
  if (active.phase !== 'pictionary-active') throw new Error('Expected active');
  return { state: active, ids: [r1.playerId, r2.playerId, r3.playerId] };
}

function makeThreePlayerDrawing() {
  const { state, ids } = makeThreePlayerActive();
  return { state: selectWord(state, 0), ids };
}

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
    const result = addPlayer(createInitialState(), 'Alice');
    expect(result.playerId).toBe('1');
    expect(result.state.players.size).toBe(1);
    expect(result.state.players.get('1')!.handle).toBe('Alice');
  });

  it('increments nextPlayerId', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    const result = addPlayer(state, 'Bob');
    expect(result.playerId).toBe('2');
    expect(result.state.nextPlayerId).toBe(3);
  });
});

describe('removePlayer', () => {
  it('deletes the player in waiting phase', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
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
    state = addPlayer(state, 'Alice').state;
    state = setReady(state, '1', true);
    expect(state.players.get('1')!.ready).toBe(true);
  });
});

describe('checkAllReady', () => {
  it('does not start with fewer than 2 players', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = setReady(state, '1', true);
    expect(checkAllReady(state).phase).toBe('pictionary-waiting');
  });

  it('does not start if not all players are ready', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    state = addPlayer(state, 'Bob').state;
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
  it('appends a draw op to currentTurnOps', () => {
    const active = makeTwoPlayerDrawing();
    const op = { type: 'draw-start' as const, color: '#000', size: 5, x: 10, y: 20 };
    const result = recordDrawOp(active, op);
    expect(result.currentTurnOps).toEqual([op]);
    const op2 = { type: 'draw-end' as const };
    const result2 = recordDrawOp(result, op2);
    expect(result2.currentTurnOps).toEqual([op, op2]);
  });
});

describe('submitGuess', () => {
  it('returns correct=true for the right word (case-insensitive)', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const { state, correct } = submitGuess(active, guesserId, active.word.toUpperCase());
    expect(correct).toBe(true);
    expect(state.correctGuessers.length).toBe(1);
    expect(state.correctGuessers[0].playerId).toBe(guesserId);
  });

  it('accepts a guess with one letter substituted', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    // Replace the first letter with something wrong
    const typo = 'X' + active.word.slice(1);
    const { correct } = submitGuess(active, guesserId, typo);
    expect(correct).toBe(true);
  });

  it('accepts a guess with one letter missing', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    // Drop the last letter
    const shortened = active.word.slice(0, -1);
    const { correct } = submitGuess(active, guesserId, shortened);
    expect(correct).toBe(true);
  });

  it('accepts a guess with one extra letter', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const extra = active.word + 'z';
    const { correct } = submitGuess(active, guesserId, extra);
    expect(correct).toBe(true);
  });

  it('returns correct=false for a wrong word', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const { state, correct } = submitGuess(active, guesserId, 'definitely-wrong-word-xyz');
    expect(correct).toBe(false);
    expect(state.correctGuessers.length).toBe(0);
  });

  it('drawer cannot guess', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const { correct } = submitGuess(active, drawerId, active.word);
    expect(correct).toBe(false);
  });

  it('player cannot guess twice', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const { state } = submitGuess(active, guesserId, active.word);
    const { correct: secondCorrect } = submitGuess(state, guesserId, active.word);
    expect(secondCorrect).toBe(false);
    expect(state.correctGuessers.length).toBe(1);
  });

  it('awards points to guesser and drawer', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const { state } = submitGuess(active, guesserId, active.word);
    expect(state.scores.get(guesserId)!).toBeGreaterThan(0);
    expect(state.scores.get(drawerId)!).toBe(1);
  });
});

describe('checkTurnComplete', () => {
  it('returns false when not all guessers have guessed', () => {
    const { state, ids } = makeThreePlayerDrawing();
    const drawerId = getCurrentDrawer(state);
    const guesserIds = ids.filter(id => id !== drawerId);
    const { state: afterGuess } = submitGuess(state, guesserIds[0], state.word);
    expect(checkTurnComplete(afterGuess)).toBe(false);
  });

  it('returns true when all connected guessers have guessed', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const { state } = submitGuess(active, guesserId, active.word);
    expect(checkTurnComplete(state)).toBe(true);
  });

  it('ignores disconnected guessers', () => {
    const { state, ids } = makeThreePlayerDrawing();
    const drawerId = getCurrentDrawer(state);
    const guesserIds = ids.filter(id => id !== drawerId);
    // Disconnect one guesser
    const afterDisconnect = removePlayer(state, guesserIds[1]) as PictionaryActiveState;
    // Other guesser guesses correctly
    const { state: afterGuess } = submitGuess(afterDisconnect, guesserIds[0], state.word);
    expect(checkTurnComplete(afterGuess)).toBe(true);
  });
});

describe('shortenDeadline', () => {
  it('shortens deadline when all guessers are correct', () => {
    const { state, ids } = makeThreePlayerDrawing();
    const drawerId = getCurrentDrawer(state);
    const guesserIds = ids.filter(id => id !== drawerId);
    const originalDeadline = state.turnDeadline;

    // Player 1 guesses correctly
    let result = submitGuess(state, guesserIds[0], state.word);
    expect(result.correct).toBe(true);
    // Not all guessed yet
    expect(checkTurnComplete(result.state)).toBe(false);

    // Player 2 guesses correctly — now all guessers are done
    result = submitGuess(result.state, guesserIds[1], state.word);
    expect(result.correct).toBe(true);
    expect(checkTurnComplete(result.state)).toBe(true);

    // Shorten the deadline
    const shortened = shortenDeadline(result.state);
    expect(shortened.turnDeadline).toBeLessThan(originalDeadline);
    expect(shortened.turnDeadline).toBeLessThanOrEqual(Date.now() + ALL_GUESSED_GRACE_MS);
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

  it('goes to postgame after all turns', () => {
    let active = makeTwoPlayerDrawing();
    // Advance through both turns
    let next = advanceTurn(active);
    if (next.phase !== 'pictionary-active') throw new Error('Expected active');
    next = selectWord(next, 0);
    const result = advanceTurn(next);
    expect(result.phase).toBe('pictionary-postgame');
    if (result.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
    expect(result.turns.length).toBe(2);
  });

  it('skips disconnected drawers', () => {
    const { state, ids } = makeThreePlayerDrawing();
    // Disconnect the player who would draw next
    const nextDrawerIndex = state.currentTurnIndex + 1;
    if (nextDrawerIndex >= state.order.length) throw new Error('Need at least 3 players');
    const nextDrawerId = state.order[nextDrawerIndex];
    const afterDisconnect = removePlayer(state, nextDrawerId) as PictionaryActiveState;
    const result = advanceTurn(afterDisconnect);
    if (result.phase !== 'pictionary-active') throw new Error('Expected active');
    // Should have skipped the disconnected drawer
    expect(result.currentTurnIndex).toBeGreaterThan(nextDrawerIndex);
    const newDrawer = getCurrentDrawer(result);
    expect(result.players.get(newDrawer)!.connected).toBe(true);
  });
});

describe('resetGame', () => {
  it('returns to waiting with connected players', () => {
    let active = makeTwoPlayerDrawing();
    active = advanceTurn(active) as PictionaryActiveState;
    active = selectWord(active, 0);
    const postgame = advanceTurn(active);
    if (postgame.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
    const waiting = resetGame(postgame);
    expect(waiting.phase).toBe('pictionary-waiting');
    expect(waiting.players.size).toBe(2);
    for (const [, p] of waiting.players) {
      expect(p.ready).toBe(false);
    }
  });

  it('excludes disconnected players on reset', () => {
    let active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    active = removePlayer(active, drawerId) as PictionaryActiveState;
    active = advanceTurn(active) as PictionaryActiveState;
    active = selectWord(active, 0);
    const postgame = advanceTurn(active);
    if (postgame.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
    const waiting = resetGame(postgame);
    expect(waiting.players.size).toBe(1);
    expect(waiting.players.has(drawerId)).toBe(false);
  });
});

describe('getClientState', () => {
  it('projects waiting state', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice').state;
    const client = getClientState(state, '1');
    expect(client.phase).toBe('pictionary-waiting');
    if (client.phase !== 'pictionary-waiting') throw new Error();
    expect(client.players.length).toBe(1);
    expect(client.players[0].handle).toBe('Alice');
  });

  it('projects picking state for drawer (includes wordChoices)', () => {
    const active = makeTwoPlayerActive();
    const drawerId = getCurrentDrawer(active);
    const client = getClientState(active, drawerId);
    if (client.phase !== 'pictionary-active') throw new Error();
    expect(client.subPhase).toBe('picking');
    expect(client.role).toBe('drawer');
    expect(client.wordChoices).toHaveLength(3);
    expect(client.word).toBeNull();
  });

  it('projects picking state for guesser (hides wordChoices)', () => {
    const active = makeTwoPlayerActive();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const client = getClientState(active, guesserId);
    if (client.phase !== 'pictionary-active') throw new Error();
    expect(client.subPhase).toBe('picking');
    expect(client.role).toBe('guesser');
    expect(client.wordChoices).toBeNull();
    expect(client.word).toBeNull();
  });

  it('projects drawing state for drawer (includes word)', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const client = getClientState(active, drawerId);
    if (client.phase !== 'pictionary-active') throw new Error();
    expect(client.subPhase).toBe('drawing');
    expect(client.role).toBe('drawer');
    expect(client.word).toBe(active.word);
    expect(client.currentDrawerHandle).toBeTruthy();
    expect(client.turnNumber).toBe(1);
    expect(client.totalTurns).toBe(2);
  });

  it('projects drawing state for guesser (hides word)', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    const client = getClientState(active, guesserId);
    if (client.phase !== 'pictionary-active') throw new Error();
    expect(client.subPhase).toBe('drawing');
    expect(client.role).toBe('guesser');
    expect(client.word).toBeNull();
  });

  it('projects postgame state with scores and turns', () => {
    let active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
    // Guess correctly
    const { state: afterGuess } = submitGuess(active, guesserId, active.word);
    // Advance through all turns
    let next = advanceTurn(afterGuess);
    if (next.phase === 'pictionary-active') {
      next = selectWord(next, 0);
      next = advanceTurn(next);
    }
    if (next.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
    const client = getClientState(next, guesserId);
    if (client.phase !== 'pictionary-postgame') throw new Error();
    expect(client.players.length).toBe(2);
    expect(client.turns.length).toBeGreaterThan(0);
    expect(client.turns[0].word).toBeTruthy();
    expect(client.turns[0].drawerHandle).toBeTruthy();
  });

  it('projects postgame state with ready and connected fields', () => {
    const postgame = makeTwoPlayerPostgame();
    const playerId = Array.from(postgame.players.keys())[0];
    const client = getClientState(postgame, playerId);
    if (client.phase !== 'pictionary-postgame') throw new Error();
    for (const p of client.players) {
      expect(p).toHaveProperty('ready');
      expect(p).toHaveProperty('connected');
      expect(p.ready).toBe(false);
      expect(p.connected).toBe(true);
    }
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
    // Disconnect one player
    postgame = removePlayer(postgame, ids[1]) as PictionaryPostgameState;
    // Only one connected player ready — not enough
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
