// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../server.js';
import WebSocket from 'ws';
import type { Server } from 'node:http';
import type { ServerMessage, ClientMessage } from '../protocol.js';

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
      ops: [{ type: 'draw-start', color: '#000000', size: 5, x: 10, y: 10 }, { type: 'draw-end' }],
      text: 'Test card',
    });

    const stateForAlice = await c1.next();
    const stateForBob = await c2.next();

    expect(stateForAlice.type).toBe('state');
    if (stateForAlice.type === 'state' && stateForAlice.state.phase === 'bwc-waiting') {
      expect(stateForAlice.state.library.length).toBe(1);
      expect(stateForAlice.state.library[0].text).toBe('Test card');
      expect(stateForAlice.state.library[0].creatorHandle).toBe('Alice');
      expect(stateForAlice.state.library[0].ops.length).toBe(2);
    }

    expect(stateForBob.type).toBe('state');
    if (stateForBob.type === 'state' && stateForBob.state.phase === 'bwc-waiting') {
      expect(stateForBob.state.library.length).toBe(1);
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
      ops: [{ type: 'draw-start', color: '#000', size: 5, x: 10, y: 10 }, { type: 'draw-end' }],
      text: 'Test card',
    });
    const stateAfterCreate = await c1.next();
    await c2.next(); // same broadcast
    let cardId: string | undefined;
    if (stateAfterCreate.type === 'state' && stateAfterCreate.state.phase === 'bwc-waiting') {
      cardId = stateAfterCreate.state.library[0]?.id;
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

    // Spawn the card on the table.
    c1.send({
      type: 'bwc-spawn-card',
      cardId: cardId!,
      surface: { kind: 'table' },
      pose: { x: 100, y: 200, rot: 0 },
      faceUp: true,
    });
    const afterSpawn = await c1.next();
    await c2.next();
    if (afterSpawn.type === 'state' && afterSpawn.state.phase === 'bwc-playing') {
      const table = afterSpawn.state.table;
      if (table.visibility === 'full') {
        expect(table.objects.length).toBe(1);
        const obj = table.objects[0];
        expect(obj.kind).toBe('card');
        if (obj.kind === 'card') {
          expect(obj.faceUp).toBe(true);
          expect(obj.card?.text).toBe('Test card');
        }
      }
    }

    // Move the card.
    c1.send({
      type: 'bwc-move-object',
      from: { kind: 'table' },
      objectId: 'obj-1',
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
    c1.send({ type: 'bwc-flip-object', surface: { kind: 'table' }, objectId: 'obj-1' });
    const afterFlip = await c1.next();
    await c2.next();
    if (afterFlip.type === 'state' && afterFlip.state.phase === 'bwc-playing') {
      const table = afterFlip.state.table;
      if (table.visibility === 'full' && table.objects.length === 1) {
        const obj = table.objects[0];
        expect(obj.faceUp).toBe(false);
        // Face-down card should NOT expose card data.
        if (obj.kind === 'card') {
          expect(obj.card).toBeUndefined();
        }
      }
    }

    // Delete the card (returns to library).
    c1.send({ type: 'bwc-delete-object', surface: { kind: 'table' }, objectId: 'obj-1' });
    const afterDelete = await c1.next();
    await c2.next();
    if (afterDelete.type === 'state' && afterDelete.state.phase === 'bwc-playing') {
      const table = afterDelete.state.table;
      if (table.visibility === 'full') {
        expect(table.objects.length).toBe(0);
      }
      // Card is back in the library and can be spawned again.
      expect(afterDelete.state.library.length).toBe(1);
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
