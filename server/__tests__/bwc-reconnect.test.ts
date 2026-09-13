// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../server.js';
import WebSocket from 'ws';
import type { Server } from 'node:http';
import type { ServerMessage, ClientMessage } from '../protocol.js';
import { normalizeOps, type DrawOp } from '../draw-ops.js';

let server: Server;
let port: number;
const openSockets: WebSocket[] = [];

async function startServer(): Promise<void> {
  server = createServer('secret', 'bwc');
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const addr = server.address();
  if (typeof addr === 'object' && addr) {
    port = addr.port;
  }
}

function stopServer(): Promise<void> {
  for (const ws of openSockets) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
  openSockets.length = 0;
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

type Client = {
  ws: WebSocket;
  next(timeoutMs?: number): Promise<ServerMessage>;
  send(msg: ClientMessage): void;
  close(): Promise<void>;
};

function createClient(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    openSockets.push(ws);

    const pending: ServerMessage[] = [];
    const waiters: Array<(msg: ServerMessage) => void> = [];

    ws.on('message', (data) => {
      const msg: ServerMessage = JSON.parse(String(data));
      const waiter = waiters.shift();
      if (waiter) {
        waiter(msg);
      } else {
        pending.push(msg);
      }
    });

    ws.on('open', () => {
      resolve({
        ws,
        next(timeoutMs = 2000): Promise<ServerMessage> {
          const queued = pending.shift();
          if (queued) return Promise.resolve(queued);
          return new Promise((res, rej) => {
            const timer = setTimeout(
              () => rej(new Error('Timed out waiting for message')),
              timeoutMs,
            );
            waiters.push((msg) => {
              clearTimeout(timer);
              res(msg);
            });
          });
        },
        send(msg: ClientMessage) {
          ws.send(JSON.stringify(msg));
        },
        close() {
          return new Promise((res) => {
            ws.once('close', () => res());
            ws.close();
          });
        },
      });
    });

    ws.on('error', reject);
  });
}

async function joinBwc(handle: string, clientId: string): Promise<{ client: Client; playerId: string }> {
  const client = await createClient();
  client.send({ type: 'join', password: 'secret', handle, clientId });
  const joined = await client.next();
  if (joined.type !== 'joined') throw new Error(`Expected joined, got ${joined.type}`);
  await client.next(); // state
  return { client, playerId: joined.playerId };
}

describe('bwc card creation', () => {
  beforeEach(async () => { await startServer(); });
  afterEach(async () => { await stopServer(); });

  it('creates a card and broadcasts it in the library', async () => {
    const { client: c1 } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next(); // state from Bob joining

    c1.send({
      type: 'bwc-create-card',
      name: '', cardType: '',
      ops: [{ type: 'draw-start', color: '#000000', size: 5, x: 10, y: 10 }, { type: 'draw-end' }],
      text: 'Test card',
    });

    const stateForAlice = await c1.next();
    const stateForBob = await c2.next();

    expect(stateForAlice.type).toBe('state');
    if (stateForAlice.type === 'state' && stateForAlice.state.phase === 'bwc-waiting') {
      expect(stateForAlice.state.library.length).toBe(1);
      const card = stateForAlice.state.cards[stateForAlice.state.library[0]];
      expect(card.text).toBe('Test card');
      expect(card.creatorHandle).toBe('Alice');
      expect(card.opsHash).toBeTruthy();
    }

    expect(stateForBob.type).toBe('state');
    if (stateForBob.type === 'state' && stateForBob.state.phase === 'bwc-waiting') {
      expect(stateForBob.state.library.length).toBe(1);
    }
  });
});

describe('bwc seating', () => {
  beforeEach(async () => { await startServer(); });
  afterEach(async () => { await stopServer(); });

  it('assigns seats with correct sides for 4 players', async () => {
    const c1 = await joinBwc('Alice', 'cid-A');
    const c2 = await joinBwc('Bob', 'cid-B');
    const c3 = await joinBwc('Carol', 'cid-C');
    const c4 = await joinBwc('Dave', 'cid-D');
    // Drain join broadcasts.
    await c1.client.next(); await c1.client.next(); await c1.client.next();
    await c2.client.next(); await c2.client.next();
    await c3.client.next();

    // Ready all.
    for (const c of [c1, c2, c3, c4]) c.client.send({ type: 'ready' });
    // Drain ready broadcasts (3 individual readies + 1 transition).
    for (const c of [c1, c2, c3, c4]) {
      // Read until we get a playing state.
      let msg;
      do {
        msg = await c.client.next();
      } while (msg.type === 'state' && msg.state.phase === 'bwc-waiting');

      if (msg.type === 'state' && msg.state.phase === 'bwc-playing') {
        const sides = new Set(msg.state.seats.map(s => s.side));
        expect(sides).toEqual(new Set(['S', 'N', 'E', 'W']));
      }
    }
  });
});

describe('bwc card editing', () => {
  beforeEach(async () => { await startServer(); });
  afterEach(async () => { await stopServer(); });

  it('edits a card and broadcasts the updated library', async () => {
    const { client: c1 } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next(); // state from Bob

    // Create a card.
    c1.send({
      type: 'bwc-create-card',
      name: '', cardType: '',
      ops: [{ type: 'draw-start', color: '#000', size: 5, x: 10, y: 10 }, { type: 'draw-end' }],
      text: 'Original',
    });
    const afterCreate = await c1.next();
    await c2.next();
    let cardId: string | undefined;
    if (afterCreate.type === 'state' && afterCreate.state.phase === 'bwc-waiting') {
      cardId = afterCreate.state.library[0];
    }
    expect(cardId).toBeDefined();

    // Edit the card.
    c1.send({
      type: 'bwc-edit-card',
      cardId: cardId!,
      ops: [
        { type: 'draw-start', color: '#000', size: 5, x: 10, y: 10 },
        { type: 'draw-end' },
        { type: 'draw-start', color: '#ff0000', size: 10, x: 50, y: 50 },
        { type: 'draw-end' },
      ],
      name: 'Edited Name',
      cardType: 'Edited Type',
      text: 'Edited',
    });
    const afterEdit = await c1.next();
    const afterEditBob = await c2.next();

    if (afterEdit.type === 'state' && afterEdit.state.phase === 'bwc-waiting') {
      expect(afterEdit.state.library.length).toBe(1);
      expect(afterEdit.state.cards[afterEdit.state.library[0]].text).toBe('Edited');
    }
    if (afterEditBob.type === 'state' && afterEditBob.state.phase === 'bwc-waiting') {
      expect(afterEditBob.state.cards[afterEditBob.state.library[0]].text).toBe('Edited');
    }
  });
});

describe('bwc playing phase', () => {
  beforeEach(async () => { await startServer(); });
  afterEach(async () => { await stopServer(); });

  it('transitions to playing when all ready, supports spawn/move/flip/delete', async () => {
    const { client: c1 } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next(); // state from Bob joining

    // Create a card first.
    c1.send({
      type: 'bwc-create-card',
      name: '', cardType: '',
      ops: [{ type: 'draw-start', color: '#000', size: 5, x: 10, y: 10 }, { type: 'draw-end' }],
      text: 'Test card',
    });
    const stateAfterCreate = await c1.next();
    await c2.next(); // same broadcast
    let cardId: string | undefined;
    if (stateAfterCreate.type === 'state' && stateAfterCreate.state.phase === 'bwc-waiting') {
      cardId = stateAfterCreate.state.library[0];
    }
    expect(cardId).toBeDefined();

    // Ready up.
    c1.send({ type: 'ready' });
    await c1.next(); await c2.next();
    c2.send({ type: 'ready' });
    const playingState = await c1.next();
    await c2.next();

    expect(playingState.type).toBe('state');
    if (playingState.type === 'state') {
      expect(playingState.state.phase).toBe('bwc-playing');
    }

    // The card should be in a shuffled deck on the table (initial state).
    // The deck object id is 'obj-1' since it's created first.
    if (playingState.type === 'state' && playingState.state.phase === 'bwc-playing') {
      const table = playingState.state.table;
      if (table.visibility === 'full') {
        expect(table.objects.length).toBe(1);
        expect(table.objects[0].kind).toBe('deck');
      }
    }

    // The initial deck is face-down. Flip it face-up before drawing.
    c1.send({ type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-1' });
    await c1.next(); await c2.next();

    // Draw the card from the (now face-up) deck.
    c1.send({
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 100, y: 200, rot: 0 },
    });
    const afterDraw = await c1.next();
    await c2.next();
    // Deck had 1 card, so it's removed after draw. Card is now on the table.
    let drawnObjId: string | undefined;
    if (afterDraw.type === 'state' && afterDraw.state.phase === 'bwc-playing') {
      const table = afterDraw.state.table;
      if (table.visibility === 'full') {
        expect(table.objects.length).toBe(1);
        const obj = table.objects[0];
        expect(obj.kind).toBe('card');
        if (obj.kind === 'card') {
          expect(obj.faceUp).toBe(true);
          expect(afterDraw.state.cards[obj.cardId!].text).toBe('Test card');
          drawnObjId = obj.id;
        }
      }
    }
    expect(drawnObjId).toBeDefined();

    // Move the card.
    c1.send({
      type: 'bwc-move-object',
      from: { kind: 'table' },
      objectId: drawnObjId!,
      to: { kind: 'table' },
      pose: { x: 300, y: 400, rot: 90 },
    });
    const afterMove = await c1.next();
    await c2.next();
    if (afterMove.type === 'state' && afterMove.state.phase === 'bwc-playing') {
      const table = afterMove.state.table;
      if (table.visibility === 'full' && table.objects.length === 1) {
        expect(table.objects[0].pose).toEqual({ x: 300, y: 400, rot: 90 });
      }
    }

    // Flip the card face-down.
    c1.send({ type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: drawnObjId! });
    const afterFlip = await c1.next();
    await c2.next();
    if (afterFlip.type === 'state' && afterFlip.state.phase === 'bwc-playing') {
      const table = afterFlip.state.table;
      if (table.visibility === 'full' && table.objects.length === 1) {
        const obj = table.objects[0];
        expect(obj.faceUp).toBe(false);
        if (obj.kind === 'card') {
          expect(obj.cardId).toBeUndefined();
        }
      }
    }

    // Delete the card (returns to library).
    c1.send({ type: 'bwc-delete-object', surface: { kind: 'table' }, objectId: drawnObjId! });
    const afterDelete = await c1.next();
    await c2.next();
    if (afterDelete.type === 'state' && afterDelete.state.phase === 'bwc-playing') {
      const table = afterDelete.state.table;
      if (table.visibility === 'full') {
        expect(table.objects.length).toBe(0);
      }
      // The card is back in library limbo, which the client can no longer
      // see: nothing visible references it, so it drops out of `cards`.
      expect(Object.keys(afterDelete.state.cards)).toEqual([]);
    }
  });

  it('drawing from a face-down deck produces a face-down card', async () => {
    const { client: c1 } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next(); // state from Bob joining

    // Create a card.
    c1.send({
      type: 'bwc-create-card',
      name: 'Secret', cardType: '',
      ops: [{ type: 'draw-start', color: '#000', size: 5, x: 10, y: 10 }, { type: 'draw-end' }],
      text: 'Hidden card',
    });
    await c1.next(); await c2.next();

    // Ready up to start playing.
    c1.send({ type: 'ready' });
    await c1.next(); await c2.next();
    c2.send({ type: 'ready' });
    await c1.next(); await c2.next();

    // The initial deck is face-down. Draw without flipping.
    c1.send({
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 100, y: 200, rot: 0 },
    });
    const afterDraw = await c1.next();
    await c2.next();
    if (afterDraw.type === 'state' && afterDraw.state.phase === 'bwc-playing') {
      const table = afterDraw.state.table;
      if (table.visibility === 'full') {
        expect(table.objects.length).toBe(1);
        const obj = table.objects[0];
        expect(obj.kind).toBe('card');
        if (obj.kind === 'card') {
          expect(obj.faceUp).toBe(false);
          // Face-down card should not expose its content.
          expect(obj.cardId).toBeUndefined();
        }
      }
    }
  });

  it('drawing from a face-up deck produces a face-up card', async () => {
    const { client: c1 } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next();

    c1.send({
      type: 'bwc-create-card',
      name: 'Visible', cardType: '',
      ops: [{ type: 'draw-start', color: '#000', size: 5, x: 10, y: 10 }, { type: 'draw-end' }],
      text: 'Shown card',
    });
    await c1.next(); await c2.next();

    c1.send({ type: 'ready' });
    await c1.next(); await c2.next();
    c2.send({ type: 'ready' });
    await c1.next(); await c2.next();

    // Flip the deck face-up, then draw.
    c1.send({ type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-1' });
    await c1.next(); await c2.next();

    c1.send({
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: 'obj-1',
      to: { kind: 'table' },
      pose: { x: 100, y: 200, rot: 0 },
    });
    const afterDraw = await c1.next();
    await c2.next();
    if (afterDraw.type === 'state' && afterDraw.state.phase === 'bwc-playing') {
      const table = afterDraw.state.table;
      if (table.visibility === 'full') {
        expect(table.objects.length).toBe(1);
        const obj = table.objects[0];
        expect(obj.kind).toBe('card');
        if (obj.kind === 'card') {
          expect(obj.faceUp).toBe(true);
          expect(afterDraw.state.cards[obj.cardId!].text).toBe('Shown card');
        }
      }
    }
  });
});

describe('bwc reconnect', () => {
  beforeEach(async () => {
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
  });

  it('reattaches a player by clientId after disconnect', async () => {
    // Two players join so the room isn't empty when one disconnects
    // (otherwise the orchestrator wipes state).
    const alice = await createClient();
    alice.send({ type: 'join', password: 'secret', handle: 'Alice', clientId: 'cid-A' });
    const aliceJoined = await alice.next();
    expect(aliceJoined.type).toBe('joined');
    if (aliceJoined.type !== 'joined') return;
    const aliceId = aliceJoined.playerId;
    await alice.next(); // state

    const bob = await createClient();
    bob.send({ type: 'join', password: 'secret', handle: 'Bob', clientId: 'cid-B' });
    const bobJoined = await bob.next();
    expect(bobJoined.type).toBe('joined');
    await bob.next(); // state for bob
    await alice.next(); // state for alice (bob arrived)

    // Alice disconnects.
    await alice.close();
    const stateAfterDisconnect = await bob.next();
    expect(stateAfterDisconnect.type).toBe('state');
    if (stateAfterDisconnect.type === 'state' && stateAfterDisconnect.state.phase === 'bwc-waiting') {
      const aliceEntry = stateAfterDisconnect.state.players.find(p => p.id === aliceId);
      expect(aliceEntry).toBeDefined();
      expect(aliceEntry?.connected).toBe(false);
    }

    // Alice reconnects with the same clientId — should get the same playerId
    // and appear connected again.
    const alice2 = await createClient();
    alice2.send({ type: 'join', password: 'secret', handle: 'Alice', clientId: 'cid-A' });
    const alice2Joined = await alice2.next();
    expect(alice2Joined.type).toBe('joined');
    if (alice2Joined.type === 'joined') {
      expect(alice2Joined.playerId).toBe(aliceId);
    }
    await alice2.next(); // state for alice2
    const stateForBob = await bob.next();
    if (stateForBob.type === 'state' && stateForBob.state.phase === 'bwc-waiting') {
      const aliceEntry = stateForBob.state.players.find(p => p.id === aliceId);
      expect(aliceEntry?.connected).toBe(true);
      // Same playerId, no duplicate.
      expect(stateForBob.state.players.length).toBe(2);
    }
  });

  it('updates handle on reattach with the new handle', async () => {
    const alice = await createClient();
    alice.send({ type: 'join', password: 'secret', handle: 'Alice', clientId: 'cid-A' });
    await alice.next(); // joined
    await alice.next(); // state

    const bob = await createClient();
    bob.send({ type: 'join', password: 'secret', handle: 'Bob', clientId: 'cid-B' });
    await bob.next();
    await bob.next();
    await alice.next();

    await alice.close();
    await bob.next(); // disconnect broadcast

    const alice2 = await createClient();
    alice2.send({ type: 'join', password: 'secret', handle: 'Alicia', clientId: 'cid-A' });
    await alice2.next(); // joined
    await alice2.next(); // state
    const stateForBob = await bob.next();
    if (stateForBob.type === 'state' && stateForBob.state.phase === 'bwc-waiting') {
      const renamed = stateForBob.state.players.find(p => p.id === '1');
      expect(renamed?.handle).toBe('Alicia');
    }
  });
});

describe('bwc card art route', () => {
  beforeEach(async () => { await startServer(); });
  afterEach(async () => { await stopServer(); });

  const OPS: DrawOp[] = [
    { type: 'draw-start', color: '#000000', size: 5, x: 10, y: 10 },
    { type: 'draw-move', points: [{ x: 20, y: 30 }] },
    { type: 'draw-end' },
  ];

  // Creates one card and returns the library entry the server broadcast back.
  async function createCard(client: Client, text: string, ops = OPS) {
    client.send({ type: 'bwc-create-card', name: '', cardType: '', ops, text });
    const msg = await client.next();
    if (msg.type !== 'state' || msg.state.phase !== 'bwc-waiting') {
      throw new Error('Expected a waiting-phase state broadcast');
    }
    const cardId = msg.state.library[msg.state.library.length - 1];
    return msg.state.cards[cardId];
  }

  const EDITED_OPS: DrawOp[] = [...OPS, { type: 'draw-fill', x: 1, y: 1, color: '#ff0000' }];

  function artUrl(cardId: string, opsHash: string): string {
    return `http://localhost:${port}/api/bwc/card/${cardId}/${opsHash}`;
  }

  it('serves a card\'s ops by hash, marked immutable', async () => {
    const { client } = await joinBwc('Alice', 'cid-A');
    const card = await createCard(client, 'Test card');

    const res = await fetch(artUrl(card.id, card.opsHash));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(await res.json()).toEqual({ ops: normalizeOps(OPS) });
  });

  it('keeps a superseded hash resolvable after an edit', async () => {
    const { client } = await joinBwc('Alice', 'cid-A');
    const before = await createCard(client, 'Original');

    client.send({
      type: 'bwc-edit-card',
      cardId: before.id,
      name: '', cardType: '', text: 'Revised',
      ops: EDITED_OPS,
    });
    const msg = await client.next();
    if (msg.type !== 'state' || msg.state.phase !== 'bwc-waiting') throw new Error('expected state');
    const after = msg.state.cards[msg.state.library[0]];
    expect(after.opsHash).not.toBe(before.opsHash);

    // A client still holding the pre-edit state must not get a 404.
    const stale = await fetch(artUrl(before.id, before.opsHash));
    expect(stale.status).toBe(200);
    expect(await stale.json()).toEqual({ ops: normalizeOps(OPS) });

    const fresh = await fetch(artUrl(after.id, after.opsHash));
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toEqual({ ops: normalizeOps(EDITED_OPS) });
  });

  it('404s an unknown hash without caching the miss', async () => {
    const res = await fetch(artUrl('no-such-card', 'nosuchhash'));
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBeNull();
  });
});

describe('bwc projection carries no ops', () => {
  beforeEach(async () => { await startServer(); });
  afterEach(async () => { await stopServer(); });

  const ART: DrawOp[] = [
    { type: 'draw-start', color: '#000000', size: 5, x: 10, y: 10 },
    { type: 'draw-move', points: [{ x: 40, y: 40 }] },
    { type: 'draw-end' },
  ];

  it('never puts ops on the wire, in either phase', async () => {
    const { client: c1 } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next();

    const seen: string[] = [];
    c1.send({ type: 'bwc-create-card', name: 'A', cardType: 'T', ops: ART, text: 'one' });
    seen.push(JSON.stringify(await c1.next()));
    await c2.next();

    c1.send({ type: 'ready' });
    seen.push(JSON.stringify(await c1.next()));
    await c2.next();
    c2.send({ type: 'ready' });
    seen.push(JSON.stringify(await c1.next()));
    await c2.next();

    for (const raw of seen) {
      expect(raw).not.toContain('"ops"');
      expect(raw).not.toContain('draw-start');
    }
  });

  it('exposes exactly the cards the viewer can see', async () => {
    const { client: c1, playerId: alice } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next();

    for (const text of ['one', 'two', 'three']) {
      c1.send({ type: 'bwc-create-card', name: text, cardType: 'T', ops: ART, text });
      await c1.next();
      await c2.next();
    }

    // Waiting: the whole library is visible, and `library` indexes into it.
    const waiting = await (async () => {
      c1.send({ type: 'ready' });
      const msg = await c1.next();
      await c2.next();
      if (msg.type !== 'state' || msg.state.phase !== 'bwc-waiting') throw new Error('expected waiting');
      return msg.state;
    })();
    expect(waiting.library.length).toBe(3);
    expect(Object.keys(waiting.cards).sort()).toEqual([...waiting.library].sort());

    c2.send({ type: 'ready' });
    let playing = await c1.next();
    while (playing.type === 'state' && playing.state.phase === 'bwc-waiting') playing = await c1.next();
    if (playing.type !== 'state' || playing.state.phase !== 'bwc-playing') throw new Error('expected playing');

    // Playing: the deck is face-down, so only its top card is hidden too —
    // nothing on the table is revealed and the map is empty.
    expect(playing.state.cards).toEqual({});

    // Draw a card into Alice's hand and it becomes the one visible card.
    const table = playing.state.table;
    if (table.visibility !== 'full') throw new Error('expected a full table');
    const deck = table.objects.find(o => o.kind === 'deck');
    if (!deck) throw new Error('expected a deck');
    c1.send({
      type: 'bwc-draw-from-deck',
      surface: { kind: 'table' },
      deckId: deck.id,
      to: { kind: 'hand', ownerId: alice },
      pose: { x: 100, y: 100, rot: 0 },
    });
    const afterDraw = await c1.next();
    await c2.next();
    if (afterDraw.type !== 'state' || afterDraw.state.phase !== 'bwc-playing') throw new Error('expected playing');

    // The deck was face-down, so the drawn card is too, and stays hidden.
    const faceDownHand = afterDraw.state.myHand;
    if (faceDownHand.visibility !== 'full') throw new Error('expected a full hand');
    expect(afterDraw.state.cards).toEqual({});

    c1.send({
      type: 'bwc-flip-object',
      surface: { kind: 'hand', ownerId: alice },
      objectId: faceDownHand.objects[0].id,
    });
    const afterFlip = await c1.next();
    const bobsView = await c2.next();
    if (afterFlip.type !== 'state' || afterFlip.state.phase !== 'bwc-playing') throw new Error('expected playing');
    if (bobsView.type !== 'state' || bobsView.state.phase !== 'bwc-playing') throw new Error('expected playing');

    const hand = afterFlip.state.myHand;
    if (hand.visibility !== 'full') throw new Error('expected a full hand');
    const drawn = hand.objects[0];
    if (drawn.kind !== 'card' || !drawn.cardId) throw new Error('expected a face-up card');
    expect(Object.keys(afterFlip.state.cards)).toEqual([drawn.cardId]);

    // Bob sees Alice's hand as opaque, so the card is not in his map.
    expect(bobsView.state.cards).toEqual({});
  });
});

describe('bwc editable projection', () => {
  beforeEach(async () => { await startServer(); });
  afterEach(async () => { await stopServer(); });

  it('marks a card editable for its author and not for anyone else', async () => {
    const { client: c1 } = await joinBwc('Alice', 'cid-A');
    const { client: c2 } = await joinBwc('Bob', 'cid-B');
    await c1.next();

    c1.send({
      type: 'bwc-create-card',
      name: 'Alice card', cardType: '', text: 'hers',
      ops: [{ type: 'draw-start', color: '#000000', size: 5, x: 1, y: 1 }, { type: 'draw-end' }],
    });
    const forAlice = await c1.next();
    const forBob = await c2.next();
    if (forAlice.type !== 'state' || forAlice.state.phase !== 'bwc-waiting') throw new Error('expected waiting');
    if (forBob.type !== 'state' || forBob.state.phase !== 'bwc-waiting') throw new Error('expected waiting');

    const cardId = forAlice.state.library[0];
    expect(forAlice.state.cards[cardId].editable).toBe(true);
    expect(forBob.state.cards[cardId].editable).toBe(false);

    // Bob's rejected edit changes nothing and produces no broadcast, so the
    // next thing Alice hears is a later, unrelated state.
    c2.send({
      type: 'bwc-edit-card', cardId,
      name: 'Bob card', cardType: '', text: 'his',
      ops: [{ type: 'draw-start', color: '#ff0000', size: 5, x: 2, y: 2 }, { type: 'draw-end' }],
    });
    c1.send({ type: 'ready' });
    const next = await c1.next();
    if (next.type !== 'state' || next.state.phase !== 'bwc-waiting') throw new Error('expected waiting');
    expect(next.state.cards[cardId].text).toBe('hers');
    expect(next.state.players.find(p => p.handle === 'Alice')?.ready).toBe(true);
  });
});
