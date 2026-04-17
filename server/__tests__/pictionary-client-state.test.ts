import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  addPlayer,
  getCurrentDrawer,
  submitGuess,
  advanceTurn,
  selectWord,
  setReady,
  removePlayer,
} from '../games/pictionary/state.js';
import { getClientState, getWordHints } from '../games/pictionary/client-state.js';
import type { PictionaryActiveState, PictionaryPostgameState } from '../games/pictionary/types.js';
import {
  setupWords,
  makeTwoPlayerActive,
  makeTwoPlayerDrawing,
  makeTwoPlayerPostgame,
} from './pictionary-helpers.js';

setupWords();

describe('getClientState', () => {
  it('projects waiting state', () => {
    let state = createInitialState();
    state = addPlayer(state, 'Alice', 'cid-Alice').state;
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
    expect(client.totalTurns).toBe(6);
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
    const { state: afterGuess } = submitGuess(active, guesserId, active.word);
    let next: PictionaryActiveState | PictionaryPostgameState = advanceTurn(afterGuess);
    while (next.phase === 'pictionary-active') {
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

describe('getWordHints', () => {
  it('renders blanks for a simple word', () => {
    const { blank } = getWordHints('cat', []);
    expect(blank).toBe('___(3)');
  });

  it('renders blanks for a multi-word phrase', () => {
    const { blank } = getWordHints('ice cream', []);
    expect(blank).toBe('___(3) _____(5)');
  });

  it('renders blanks for a hyphenated word', () => {
    const { blank } = getWordHints('t-rex', []);
    expect(blank).toBe('_(1)-___(3)');
  });

  it('reveals hint letters incrementally', () => {
    const { blank, reveals } = getWordHints('t-rex', [0, 3]);
    expect(blank).toBe('_(1)-___(3)');
    expect(reveals[0]).toBe('t(1)-___(3)');
    expect(reveals[1]).toBe('t(1)-_e_(3)');
  });

  it('reveals hint letters for a simple word', () => {
    const { reveals } = getWordHints('cat', [2, 0]);
    expect(reveals[0]).toBe('__t(3)');
    expect(reveals[1]).toBe('c_t(3)');
  });

  it('renders blanks for a word with an apostrophe', () => {
    const { blank, reveals } = getWordHints("don't", [0, 4]);
    expect(blank).toBe("___'_(4)");
    expect(reveals[0]).toBe("d__'_(4)");
    expect(reveals[1]).toBe("d__'t(4)");
  });
});
