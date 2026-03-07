import path from 'node:path';
import http from 'node:http';
import express from 'express';
import type { ClientMessage, ServerMessage } from './protocol.js';
import type { GameType, PlayerId, ServerState, ReduceResult, RelayMessage } from './types.js';
import type { ConnectionId, Connection } from './transport.js';
import { getGameModule } from './game-module.js';
import { attachWebSocketTransport } from './transports/websocket.js';

export function createServer(password: string, gameType: GameType = 'epyc') {
  const gameModule = getGameModule(gameType);

  const app = express();
  const server = http.createServer(app);

  let state: ServerState = gameModule.createInitialState();
  const clients = new Map<ConnectionId, { conn: Connection; playerId: PlayerId | null }>();
  let gameTimer: ReturnType<typeof setTimeout> | null = null;

  function sendTo(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  function sendToPlayer(playerId: PlayerId, msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const [, entry] of clients) {
      if (entry.playerId === playerId) {
        entry.conn.send(data);
      }
    }
  }

  function broadcastState() {
    for (const [, entry] of clients) {
      if (entry.playerId) {
        sendTo(entry.conn, { type: 'state', state: gameModule.getClientState(state, entry.playerId) });
      }
    }
  }

  function forwardRelays(relays: RelayMessage[]) {
    for (const relay of relays) {
      const msg: ServerMessage = { type: 'relay', payload: relay.payload };
      for (const targetId of relay.to) {
        sendToPlayer(targetId, msg);
      }
    }
  }

  function clearGameTimer() {
    if (gameTimer) {
      clearTimeout(gameTimer);
      gameTimer = null;
    }
  }

  function setGameTimer(deadline: number) {
    clearGameTimer();
    const delay = Math.max(0, deadline - Date.now());
    gameTimer = setTimeout(() => {
      applyResult(gameModule.reduceTimer(state));
    }, delay);
  }

  function applyResult(result: ReduceResult) {
    state = result.state;
    for (const effect of result.effects) {
      switch (effect.type) {
        case 'broadcast':
          broadcastState();
          break;
        case 'relay':
          forwardRelays(effect.messages);
          break;
        case 'send':
          sendToPlayer(effect.playerId, effect.msg);
          break;
        case 'set-timer':
          setGameTimer(effect.deadline);
          break;
        case 'clear-timer':
          clearGameTimer();
          break;
      }
    }
  }

  attachWebSocketTransport(server, {
    onConnect(conn) {
      clients.set(conn.id, { conn, playerId: null });
    },

    onMessage(conn, data) {
      try {
        const msg = JSON.parse(data) as ClientMessage;
        const entry = clients.get(conn.id);
        if (!entry) return;

        // Join is handled here since it manages the connection→playerId mapping
        if (msg.type === 'join') {
          if (entry.playerId) {
            sendTo(conn, { type: 'error', message: 'Already joined' });
            return;
          }
          if (msg.password !== password) {
            sendTo(conn, { type: 'error', message: 'Wrong password' });
            return;
          }
          const result = gameModule.addPlayer(state, msg.handle);
          if (!result) {
            sendTo(conn, { type: 'error', message: 'Game already in progress' });
            return;
          }
          state = result.state;
          entry.playerId = result.playerId;
          sendTo(conn, { type: 'joined', playerId: result.playerId, gameType });
          broadcastState();
          return;
        }

        if (!entry.playerId) return;
        applyResult(gameModule.reduce(state, entry.playerId, msg));
      } catch {
        sendTo(conn, { type: 'error', message: 'Invalid message' });
      }
    },

    onDisconnect(conn) {
      const entry = clients.get(conn.id);
      clients.delete(conn.id);
      if (entry?.playerId) {
        applyResult(gameModule.reduceDisconnect(state, entry.playerId));
      }

      // Reset to initial state when all players have left
      const hasPlayers = Array.from(clients.values()).some(e => e.playerId !== null);
      if (!hasPlayers) {
        clearGameTimer();
        state = gameModule.createInitialState();
      }
    },
  });

  // Serve built client files
  const clientDir = path.resolve(import.meta.dirname, '..', 'dist', 'client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  return server;
}
