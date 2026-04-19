// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { bwcReduce } from '../games/bwc/state.js';
import type { BwcPlayingState, Card, Surface, TableObject } from '../games/bwc/types.js';
import type { PlayerInfo } from '../types.js';

// --- Helpers ---

function makeCard(id: string, text = ''): Card {
  return {
    id,
    ops: [],
    name: `Card ${id}`,
    cardType: '',
    text,
    creator: 'test',
    createdAt: '2024-01-01',
  };
}

function makePlayingState(overrides: Partial<BwcPlayingState> = {}): BwcPlayingState {
  const players = new Map<string, PlayerInfo>([
    ['p1', { id: 'p1', handle: 'Alice', ready: false, connected: true, clientId: 'c1' }],
  ]);
  return {
    phase: 'bwc-playing',
    players,
    nextPlayerId: 2,
    library: new Map(),
    inPlay: new Set(),
    seats: new Map([['p1', { seatIndex: 0, side: 'S', fraction: 0.5 }]]),
    table: { id: { kind: 'table' }, objects: new Map() },
    hands: new Map([['p1', { id: { kind: 'hand', ownerId: 'p1' }, objects: new Map() }]]),
    scores: new Map([['p1', 0]]),
    nextObjectId: 100,
    zCounter: 1,
    zBatchCount: 0,
    ...overrides,
  };
}

function getTableObjects(state: BwcPlayingState): TableObject[] {
  return Array.from(state.table.objects.values());
}

// --- Tests ---

describe('bwc-flip-object', () => {
  it('toggles a card from face-up to face-down', () => {
    const card: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const state = makePlayingState({
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card]]) },
    });

    const result = bwcReduce(state, 'p1', { type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-1' });
    const objs = getTableObjects(result.state as BwcPlayingState);
    expect(objs[0].faceUp).toBe(false);
  });

  it('toggles a card from face-down to face-up', () => {
    const card: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: false, z: 1 };
    const state = makePlayingState({
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card]]) },
    });

    const result = bwcReduce(state, 'p1', { type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-1' });
    const objs = getTableObjects(result.state as BwcPlayingState);
    expect(objs[0].faceUp).toBe(true);
  });
});

describe('bwc-draw-from-deck', () => {
  it('drawn card inherits faceUp from a face-up deck', () => {
    const library = new Map([['c1', makeCard('c1', 'Hello')]]);
    const deck: TableObject = { kind: 'deck', id: 'obj-1', cardIds: ['c1'], pose: { x: 100, y: 100, rot: 0 }, faceUp: true, z: 1 };
    const state = makePlayingState({
      library,
      inPlay: new Set(['c1']),
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', deck]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 200, y: 100, rot: 0 },
    });

    const objs = getTableObjects(result.state as BwcPlayingState);
    expect(objs.length).toBe(1);
    expect(objs[0].kind).toBe('card');
    expect(objs[0].faceUp).toBe(true);
  });

  it('drawn card inherits faceUp from a face-down deck', () => {
    const library = new Map([['c1', makeCard('c1', 'Secret')]]);
    const deck: TableObject = { kind: 'deck', id: 'obj-1', cardIds: ['c1'], pose: { x: 100, y: 100, rot: 0 }, faceUp: false, z: 1 };
    const state = makePlayingState({
      library,
      inPlay: new Set(['c1']),
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', deck]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 200, y: 100, rot: 0 },
    });

    const objs = getTableObjects(result.state as BwcPlayingState);
    expect(objs.length).toBe(1);
    expect(objs[0].kind).toBe('card');
    expect(objs[0].faceUp).toBe(false);
  });

  it('removes the deck when the last card is drawn', () => {
    const library = new Map([['c1', makeCard('c1')]]);
    const deck: TableObject = { kind: 'deck', id: 'obj-1', cardIds: ['c1'], pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const state = makePlayingState({
      library,
      inPlay: new Set(['c1']),
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', deck]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 200, y: 0, rot: 0 },
    });

    const objs = getTableObjects(result.state as BwcPlayingState);
    // Deck gone, only the drawn card remains.
    expect(objs.length).toBe(1);
    expect(objs[0].kind).toBe('card');
    expect(objs.find(o => o.kind === 'deck')).toBeUndefined();
  });

  it('keeps the deck when cards remain', () => {
    const library = new Map([['c1', makeCard('c1')], ['c2', makeCard('c2')]]);
    const deck: TableObject = { kind: 'deck', id: 'obj-1', cardIds: ['c1', 'c2'], pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const state = makePlayingState({
      library,
      inPlay: new Set(['c1', 'c2']),
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', deck]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 200, y: 0, rot: 0 },
    });

    const objs = getTableObjects(result.state as BwcPlayingState);
    expect(objs.length).toBe(2);
    const remainingDeck = objs.find(o => o.kind === 'deck');
    expect(remainingDeck).toBeDefined();
    if (remainingDeck?.kind === 'deck') {
      expect(remainingDeck.cardIds.length).toBe(1);
    }
  });
});

describe('bwc-move-object', () => {
  it('moves a card to a new position', () => {
    const card: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const state = makePlayingState({
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-move-object',
      from: { kind: 'table' },
      objectId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 300, y: 400, rot: 90 },
    });

    const objs = getTableObjects(result.state as BwcPlayingState);
    expect(objs[0].pose).toEqual({ x: 300, y: 400, rot: 90 });
  });

  it('moves a card from table to hand', () => {
    const card: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const state = makePlayingState({
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-move-object',
      from: { kind: 'table' },
      objectId: 'obj-1',
      to: { kind: 'hand', ownerId: 'p1' },
      pose: { x: 50, y: 10, rot: 0 },
    });

    const s = result.state as BwcPlayingState;
    expect(getTableObjects(s).length).toBe(0);
    const handObjs = Array.from(s.hands.get('p1')!.objects.values());
    expect(handObjs.length).toBe(1);
    expect(handObjs[0].pose).toEqual({ x: 50, y: 10, rot: 0 });
  });
});

describe('bwc-batch', () => {
  it('applies multiple flips atomically', () => {
    const card1: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const card2: TableObject = { kind: 'card', id: 'obj-2', cardId: 'c2', pose: { x: 100, y: 0, rot: 0 }, faceUp: true, z: 2 };
    const state = makePlayingState({
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card1], ['obj-2', card2]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-batch',
      messages: [
        { type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-1' },
        { type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-2' },
      ],
    });

    const objs = getTableObjects(result.state as BwcPlayingState);
    expect(objs.every(o => o.faceUp === false)).toBe(true);
  });

  it('emits only a single broadcast effect', () => {
    const card1: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const card2: TableObject = { kind: 'card', id: 'obj-2', cardId: 'c2', pose: { x: 100, y: 0, rot: 0 }, faceUp: true, z: 2 };
    const state = makePlayingState({
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card1], ['obj-2', card2]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-batch',
      messages: [
        { type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-1' },
        { type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-2' },
      ],
    });

    const broadcasts = result.effects.filter(e => e.type === 'broadcast');
    expect(broadcasts.length).toBe(1);
  });

  it('applies multiple moves atomically', () => {
    const card1: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const card2: TableObject = { kind: 'card', id: 'obj-2', cardId: 'c2', pose: { x: 100, y: 0, rot: 0 }, faceUp: true, z: 2 };
    const state = makePlayingState({
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card1], ['obj-2', card2]]) },
    });

    const result = bwcReduce(state, 'p1', {
      type: 'bwc-batch',
      messages: [
        { type: 'bwc-move-object', from: { kind: 'table' }, objectId: 'obj-1', to: { kind: 'table' }, pose: { x: 50, y: 50, rot: 90 } },
        { type: 'bwc-move-object', from: { kind: 'table' }, objectId: 'obj-2', to: { kind: 'table' }, pose: { x: 200, y: 200, rot: 270 } },
      ],
    });

    const objs = getTableObjects(result.state as BwcPlayingState);
    const obj1 = objs.find(o => o.id === 'obj-1')!;
    const obj2 = objs.find(o => o.id === 'obj-2')!;
    expect(obj1.pose).toEqual({ x: 50, y: 50, rot: 90 });
    expect(obj2.pose).toEqual({ x: 200, y: 200, rot: 270 });
  });

  it('produces no effects for an empty batch', () => {
    const state = makePlayingState();
    const result = bwcReduce(state, 'p1', { type: 'bwc-batch', messages: [] });
    expect(result.effects.length).toBe(0);
  });
});

describe('bwc-delete-object', () => {
  it('removes a card from the table', () => {
    const library = new Map([['c1', makeCard('c1')]]);
    const card: TableObject = { kind: 'card', id: 'obj-1', cardId: 'c1', pose: { x: 0, y: 0, rot: 0 }, faceUp: true, z: 1 };
    const state = makePlayingState({
      library,
      inPlay: new Set(['c1']),
      table: { id: { kind: 'table' }, objects: new Map([['obj-1', card]]) },
    });

    const result = bwcReduce(state, 'p1', { type: 'bwc-delete-object', surface: { kind: 'table' }, objectId: 'obj-1' });
    const s = result.state as BwcPlayingState;
    expect(getTableObjects(s).length).toBe(0);
    // Card should be removed from inPlay so it can be re-spawned.
    expect(s.inPlay.has('c1')).toBe(false);
  });
});
