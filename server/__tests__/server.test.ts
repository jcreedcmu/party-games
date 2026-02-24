// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../server.js';
import WebSocket from 'ws';
import type { Server } from 'node:http';
import type { ServerMessage, ClientMessage } from '../protocol.js';

let server: Server;
let port: number;
const openSockets: WebSocket[] = [];

async function startServer(password = 'secret'): Promise<void> {
  server = createServer(password);
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

/** A connected WebSocket with a message queue to avoid race conditions. */
type Client = {
  ws: WebSocket;
  next(timeoutMs?: number): Promise<ServerMessage>;
  send(msg: ClientMessage): void;
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
      });
    });

    ws.on('error', reject);
  });
}

/** Join a player and consume the joined + state messages. */
async function joinPlayer(handle: string): Promise<{ client: Client; playerId: string }> {
  const client = await createClient();
  client.send({ type: 'join', password: 'secret', handle });
  const joined = await client.next();
  if (joined.type !== 'joined') throw new Error(`Expected joined, got ${joined.type}`);
  await client.next(); // state broadcast
  return { client, playerId: joined.playerId };
}

describe('server integration', () => {
  beforeEach(async () => {
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
  });

  it('accepts join with correct password', async () => {
    const client = await createClient();
    client.send({ type: 'join', password: 'secret', handle: 'Alice' });

    const joined = await client.next();
    expect(joined.type).toBe('joined');
    expect(joined).toHaveProperty('playerId', '1');

    const stateMsg = await client.next();
    expect(stateMsg.type).toBe('state');
    if (stateMsg.type === 'state') {
      expect(stateMsg.state.phase).toBe('waiting');
    }
  });

  it('rejects join with wrong password', async () => {
    const client = await createClient();
    client.send({ type: 'join', password: 'wrong', handle: 'Alice' });

    const msg = await client.next();
    expect(msg.type).toBe('error');
    if (msg.type === 'error') {
      expect(msg.message).toBe('Wrong password');
    }
  });

  it('rejects double join', async () => {
    const { client } = await joinPlayer('Alice');
    client.send({ type: 'join', password: 'secret', handle: 'Alice2' });

    const msg = await client.next();
    expect(msg.type).toBe('error');
    if (msg.type === 'error') {
      expect(msg.message).toBe('Already joined');
    }
  });

  it('broadcasts state to all players when a new player joins', async () => {
    const { client: c1 } = await joinPlayer('Alice');
    const c2 = await createClient();
    c2.send({ type: 'join', password: 'secret', handle: 'Bob' });

    await c2.next(); // joined response
    const stateForBob = await c2.next();
    const stateForAlice = await c1.next();

    expect(stateForBob.type).toBe('state');
    expect(stateForAlice.type).toBe('state');
    if (stateForAlice.type === 'state' && stateForAlice.state.phase === 'waiting') {
      expect(stateForAlice.state.players.length).toBe(2);
    }
  });

  it('transitions to underway when all players ready up', async () => {
    const { client: c1 } = await joinPlayer('Alice');
    const { client: c2 } = await joinPlayer('Bob');
    await c1.next(); // state broadcast from Bob joining

    c1.send({ type: 'ready' });
    await c1.next(); // state (Alice ready)
    await c2.next(); // state (Alice ready)

    c2.send({ type: 'ready' });
    const state1 = await c1.next();
    const state2 = await c2.next();

    expect(state1.type).toBe('state');
    if (state1.type === 'state') {
      expect(state1.state.phase).toBe('underway');
    }
    expect(state2.type).toBe('state');
    if (state2.type === 'state') {
      expect(state2.state.phase).toBe('underway');
    }
  });

  it('handles unready', async () => {
    const { client: c1 } = await joinPlayer('Alice');
    const { client: c2 } = await joinPlayer('Bob');
    await c1.next(); // state from Bob joining

    c1.send({ type: 'ready' });
    await c1.next();
    await c2.next();

    c1.send({ type: 'unready' });
    const stateMsg = await c1.next();
    expect(stateMsg.type).toBe('state');
    if (stateMsg.type === 'state' && stateMsg.state.phase === 'waiting') {
      const alice = stateMsg.state.players.find(p => p.handle === 'Alice');
      expect(alice?.ready).toBe(false);
    }
  });

  it('handles disconnect in waiting phase', async () => {
    const { client: c1 } = await joinPlayer('Alice');
    const { client: c2 } = await joinPlayer('Bob');
    await c1.next(); // state from Bob joining

    c2.ws.close();
    const stateMsg = await c1.next();
    expect(stateMsg.type).toBe('state');
    if (stateMsg.type === 'state' && stateMsg.state.phase === 'waiting') {
      expect(stateMsg.state.players.length).toBe(1);
      expect(stateMsg.state.players[0].handle).toBe('Alice');
    }
  });

  it('marks player as disconnected during underway', async () => {
    const { client: c1 } = await joinPlayer('Alice');
    const { client: c2 } = await joinPlayer('Bob');
    await c1.next(); // state from Bob joining

    // Ready up both
    c1.send({ type: 'ready' });
    await c1.next();
    await c2.next();
    c2.send({ type: 'ready' });
    await c1.next(); // underway
    await c2.next(); // underway

    // Bob disconnects
    c2.ws.close();
    const stateMsg = await c1.next();
    expect(stateMsg.type).toBe('state');
    if (stateMsg.type === 'state' && stateMsg.state.phase === 'underway') {
      const bob = stateMsg.state.players.find(p => p.handle === 'Bob');
      expect(bob?.connected).toBe(false);
    }
  });

  it('rejects invalid JSON', async () => {
    const client = await createClient();
    client.ws.send('not json!!!');

    const msg = await client.next();
    expect(msg.type).toBe('error');
    if (msg.type === 'error') {
      expect(msg.message).toBe('Invalid message');
    }
  });
});
