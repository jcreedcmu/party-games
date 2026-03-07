import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from './protocol.js';
import type { GameType, PlayerId, ServerState, ReduceResult, RelayMessage } from './types.js';
import { getGameModule } from './game-module.js';

export function createServer(password: string, gameType: GameType = 'epyc') {
  const gameModule = getGameModule(gameType);

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let state: ServerState = gameModule.createInitialState();
  const clients = new Map<WebSocket, PlayerId | null>();
  let gameTimer: ReturnType<typeof setTimeout> | null = null;

  function send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function sendToPlayer(playerId: PlayerId, msg: ServerMessage) {
    for (const [ws, pid] of clients) {
      if (pid === playerId) {
        send(ws, msg);
      }
    }
  }

  function broadcastState() {
    for (const [ws, playerId] of clients) {
      if (playerId) {
        send(ws, { type: 'state', state: gameModule.getClientState(state, playerId) });
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

  wss.on('connection', (ws) => {
    clients.set(ws, null);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as ClientMessage;
        const playerId = clients.get(ws);

        // Join is handled here since it manages the ws→playerId mapping
        if (msg.type === 'join') {
          if (playerId) {
            send(ws, { type: 'error', message: 'Already joined' });
            return;
          }
          if (msg.password !== password) {
            send(ws, { type: 'error', message: 'Wrong password' });
            return;
          }
          const result = gameModule.addPlayer(state, msg.handle);
          if (!result) {
            send(ws, { type: 'error', message: 'Game already in progress' });
            return;
          }
          state = result.state;
          clients.set(ws, result.playerId);
          send(ws, { type: 'joined', playerId: result.playerId, gameType });
          broadcastState();
          return;
        }

        if (!playerId) return;
        applyResult(gameModule.reduce(state, playerId, msg));
      } catch {
        send(ws, { type: 'error', message: 'Invalid message' });
      }
    });

    ws.on('close', () => {
      const playerId = clients.get(ws);
      clients.delete(ws);
      if (playerId) {
        applyResult(gameModule.reduceDisconnect(state, playerId));
      }

      // Reset to initial state when all players have left
      const hasPlayers = Array.from(clients.values()).some(id => id !== null);
      if (!hasPlayers) {
        clearGameTimer();
        state = gameModule.createInitialState();
      }
    });
  });

  // Serve built client files
  const clientDir = path.resolve(import.meta.dirname, '..', 'dist', 'client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  return server;
}
