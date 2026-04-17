import { beforeAll } from 'vitest';
import {
  createInitialState,
  addPlayer,
  setReady,
  checkAllReady,
  selectWord,
  advanceTurn,
} from '../games/pictionary/state.js';
import { configureWords } from '../games/pictionary/words.js';
import type { PictionaryActiveState, PictionaryPostgameState } from '../games/pictionary/types.js';

export function setupWords() {
  beforeAll(() => {
    configureWords([
      { word: 'cat' }, { word: 'dog' }, { word: 'fish' },
      { word: 'bird' }, { word: 'tree' }, { word: 'sun' },
      { word: 'moon' }, { word: 'star' }, { word: 'rain' },
      { word: 'snow' },
    ]);
  });
}

export function makeTwoPlayerActive(): PictionaryActiveState {
  let state = createInitialState();
  const r1 = addPlayer(state, 'Alice', 'cid-Alice');
  state = r1.state;
  const r2 = addPlayer(state, 'Bob', 'cid-Bob');
  state = r2.state;
  state = setReady(state, r1.playerId, true);
  state = setReady(state, r2.playerId, true);
  const active = checkAllReady(state);
  if (active.phase !== 'pictionary-active') throw new Error('Expected active');
  return active;
}

export function makeTwoPlayerDrawing(): PictionaryActiveState {
  const active = makeTwoPlayerActive();
  return selectWord(active, 0);
}

export function makeTwoPlayerPostgame(): PictionaryPostgameState {
  let next: PictionaryActiveState | PictionaryPostgameState = makeTwoPlayerDrawing();
  while (next.phase === 'pictionary-active') {
    next = advanceTurn(next);
    if (next.phase === 'pictionary-active') {
      next = selectWord(next, 0);
    }
  }
  if (next.phase !== 'pictionary-postgame') throw new Error('Expected postgame');
  return next;
}

export function makeThreePlayerActive() {
  let state = createInitialState();
  const r1 = addPlayer(state, 'Alice', 'cid-Alice');
  state = r1.state;
  const r2 = addPlayer(state, 'Bob', 'cid-Bob');
  state = r2.state;
  const r3 = addPlayer(state, 'Carol', 'cid-Carol');
  state = r3.state;
  state = setReady(state, r1.playerId, true);
  state = setReady(state, r2.playerId, true);
  state = setReady(state, r3.playerId, true);
  const active = checkAllReady(state);
  if (active.phase !== 'pictionary-active') throw new Error('Expected active');
  return { state: active, ids: [r1.playerId, r2.playerId, r3.playerId] };
}

export function makeThreePlayerDrawing() {
  const { state, ids } = makeThreePlayerActive();
  return { state: selectWord(state, 0), ids };
}
