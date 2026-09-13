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
    opsHash: '',
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

describe('bwc-edit-card permissions', () => {
  const ART = [
    { type: 'draw-start', color: '#000000', size: 5, x: 1, y: 1 },
    { type: 'draw-end' },
  ] as Card['ops'];

  function edit(state: BwcPlayingState, playerId: string, cardId: string, text: string) {
    const result = bwcReduce(state, playerId, {
      type: 'bwc-edit-card', cardId, ops: ART, name: 'N', cardType: 'T', text,
    });
    return { state: result.state as BwcPlayingState, effects: result.effects };
  }

  function twoPlayers() {
    return new Map<string, PlayerInfo>([
      ['p1', { id: 'p1', handle: 'Alice', ready: false, connected: true, clientId: 'c1' }],
      ['p2', { id: 'p2', handle: 'Bob', ready: false, connected: true, clientId: 'c2' }],
    ]);
  }

  function withCard(card: Card): BwcPlayingState {
    return makePlayingState({ players: twoPlayers(), library: new Map([[card.id, card]]) });
  }

  it('lets the creator edit their own card', () => {
    const card: Card = { ...makeCard('c1'), creator: 'Alice', creatorClientId: 'c1' };
    const { state, effects } = edit(withCard(card), 'p1', 'c1', 'mine, revised');
    expect(state.library.get('c1')!.text).toBe('mine, revised');
    expect(effects).toEqual([{ type: 'broadcast' }]);
  });

  it('rejects an edit from anyone else', () => {
    const card: Card = { ...makeCard('c1', 'untouched'), creator: 'Alice', creatorClientId: 'c1' };
    const { state, effects } = edit(withCard(card), 'p2', 'c1', 'hijacked');
    expect(state.library.get('c1')!.text).toBe('untouched');
    expect(effects).toEqual([]);
  });

  it('keeps edit rights when the creator changes handle', () => {
    const card: Card = { ...makeCard('c1'), creator: 'Alice', creatorClientId: 'c1' };
    const players = twoPlayers();
    // Alice reattaches under a new handle; her clientId is what persists.
    players.set('p1', { id: 'p1', handle: 'Alicia', ready: false, connected: true, clientId: 'c1' });
    const state = makePlayingState({ players, library: new Map([[card.id, card]]) });
    expect(edit(state, 'p1', 'c1', 'still mine').state.library.get('c1')!.text).toBe('still mine');
  });

  it('lets the first editor claim an unfilled blank, then locks it to them', () => {
    const blank: Card = { ...makeCard('c1'), name: '', creator: '', ops: [], text: '' };
    const claimed = edit(withCard(blank), 'p2', 'c1', "Bob's card").state;
    expect(claimed.library.get('c1')!.creator).toBe('Bob');
    expect(claimed.library.get('c1')!.creatorClientId).toBe('c2');

    const { state, effects } = edit(claimed, 'p1', 'c1', 'Alice muscling in');
    expect(state.library.get('c1')!.text).toBe("Bob's card");
    expect(effects).toEqual([]);
  });

  it('falls back to the handle for a card stored before client ids, and upgrades it', () => {
    const legacy: Card = { ...makeCard('c1'), creator: 'Alice' };
    expect(legacy.creatorClientId).toBeUndefined();

    expect(edit(withCard(legacy), 'p2', 'c1', 'not Bob\'s').effects).toEqual([]);

    const after = edit(withCard(legacy), 'p1', 'c1', 'Alice edits').state;
    expect(after.library.get('c1')!.text).toBe('Alice edits');
    expect(after.library.get('c1')!.creatorClientId).toBe('c1');
  });
});

describe('cards authored before ownership was recorded', () => {
  const ART = [
    { type: 'draw-start', color: '#000000', size: 5, x: 1, y: 1 },
    { type: 'draw-end' },
  ] as Card['ops'];

  // Most of the stored library is like this: real art and words, no creator.
  const LEGACY: Card = {
    id: 'c1', ops: ART, opsHash: 'h', name: 'Architect', cardType: '',
    text: '+20 for each building in play', creator: '', createdAt: '2024-01-01',
  };

  function players() {
    return new Map<string, PlayerInfo>([
      ['p1', { id: 'p1', handle: 'Alice', ready: false, connected: true, clientId: 'c1' }],
      ['p2', { id: 'p2', handle: 'Bob', ready: false, connected: true, clientId: 'c2' }],
    ]);
  }

  function editBy(playerId: string, card: Card, text: string) {
    const state = makePlayingState({ players: players(), library: new Map([[card.id, card]]) });
    const result = bwcReduce(state, playerId, {
      type: 'bwc-edit-card', cardId: card.id, ops: ART, name: card.name, cardType: '', text,
    });
    return (result.state as BwcPlayingState).library.get(card.id)!;
  }

  it('stays editable by anyone and is never claimed', () => {
    const afterAlice = editBy('p1', LEGACY, 'Alice fixes a typo');
    expect(afterAlice.text).toBe('Alice fixes a typo');
    // Fixing someone else's typo must not put your name on their card.
    expect(afterAlice.creator).toBe('');
    expect(afterAlice.creatorClientId).toBeUndefined();

    expect(editBy('p2', afterAlice, 'Bob fixes another').text).toBe('Bob fixes another');
  });
});
