import { describe, it, expect } from 'vitest';
import {
  getCurrentDrawer,
  removePlayer,
  submitGuess,
  checkTurnComplete,
  shortenDeadline,
  ALL_GUESSED_GRACE_MS,
  isCloseEnough,
} from '../games/pictionary/state.js';
import type { PictionaryActiveState } from '../games/pictionary/types.js';
import {
  setupWords,
  makeTwoPlayerDrawing,
  makeThreePlayerDrawing,
} from './pictionary-helpers.js';

setupWords();

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
    const typo = 'X' + active.word.slice(1);
    const { correct } = submitGuess(active, guesserId, typo);
    expect(correct).toBe(true);
  });

  it('accepts a guess with one letter missing', () => {
    const active = makeTwoPlayerDrawing();
    const drawerId = getCurrentDrawer(active);
    const guesserId = active.order.find(id => id !== drawerId)!;
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
    const afterDisconnect = removePlayer(state, guesserIds[1]) as PictionaryActiveState;
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

    let result = submitGuess(state, guesserIds[0], state.word);
    expect(result.correct).toBe(true);
    expect(checkTurnComplete(result.state)).toBe(false);

    result = submitGuess(result.state, guesserIds[1], state.word);
    expect(result.correct).toBe(true);
    expect(checkTurnComplete(result.state)).toBe(true);

    const shortened = shortenDeadline(result.state);
    expect(shortened.turnDeadline).toBeLessThan(originalDeadline);
    expect(shortened.turnDeadline).toBeLessThanOrEqual(Date.now() + ALL_GUESSED_GRACE_MS);
  });
});

describe('isCloseEnough', () => {
  it('matches exact answers', () => {
    expect(isCloseEnough('cat', 'cat')).toBe(true);
  });

  it('matches with one substitution', () => {
    expect(isCloseEnough('cat', 'car')).toBe(true);
  });

  it('matches with one insertion', () => {
    expect(isCloseEnough('cat', 'cats')).toBe(true);
  });

  it('matches with one deletion', () => {
    expect(isCloseEnough('cats', 'cat')).toBe(true);
  });

  it('rejects two or more differences', () => {
    expect(isCloseEnough('cat', 'dog')).toBe(false);
  });

  it('ignores hyphens in guess', () => {
    expect(isCloseEnough('t-rex', 't rex')).toBe(true);
  });

  it('ignores hyphens in answer', () => {
    expect(isCloseEnough('trex', 't-rex')).toBe(true);
  });

  it('ignores apostrophes', () => {
    expect(isCloseEnough("tam o shanter", "tam o' shanter")).toBe(true);
  });

  it('matches hyphenated answer with space in guess', () => {
    expect(isCloseEnough('ice cream', 'ice-cream')).toBe(true);
  });

  it('matches when only punctuation differs', () => {
    expect(isCloseEnough("dont", "don't")).toBe(true);
  });

  it('still rejects totally wrong guesses with punctuation', () => {
    expect(isCloseEnough("hello-world", "t-rex")).toBe(false);
  });

  it('matches adjacent transposition', () => {
    expect(isCloseEnough('elehpant', 'elephant')).toBe(true);
  });

  it('matches transposition at start', () => {
    expect(isCloseEnough('tsar', 'star')).toBe(true);
  });

  it('matches transposition at end', () => {
    expect(isCloseEnough('bera', 'bear')).toBe(true);
  });

  it('rejects two transpositions', () => {
    expect(isCloseEnough('tsar bear', 'star baer')).toBe(false);
  });
});
