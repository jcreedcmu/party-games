import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from './protocol.js';
import type { GameState, PlayerId } from './types.js';
import {
  createInitialState,
  addPlayer,
  removePlayer,
  setReady,
  checkAllReady,
  submitMove,
  getClientState,
} from './state.js';

export function createServer(password: string) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let state: GameState = createInitialState();
  const clients = new Map<WebSocket, PlayerId | null>();

  function send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcastState() {
    for (const [ws, playerId] of clients) {
      if (playerId) {
        send(ws, { type: 'state', state: getClientState(state, playerId) });
      }
    }
  }

  function handleMessage(ws: WebSocket, msg: ClientMessage) {
    const playerId = clients.get(ws);

    switch (msg.type) {
      case 'join': {
        if (playerId) {
          send(ws, { type: 'error', message: 'Already joined' });
          return;
        }
        if (msg.password !== password) {
          send(ws, { type: 'error', message: 'Wrong password' });
          return;
        }
        if (state.phase !== 'waiting') {
          send(ws, { type: 'error', message: 'Game already in progress' });
          return;
        }
        const result = addPlayer(state, msg.handle);
        state = result.state;
        clients.set(ws, result.playerId);
        send(ws, { type: 'joined', playerId: result.playerId });
        broadcastState();
        return;
      }

      case 'ready':
      case 'unready': {
        if (!playerId || state.phase !== 'waiting') return;
        state = setReady(state, playerId, msg.type === 'ready');
        state = checkAllReady(state);
        broadcastState();
        return;
      }

      case 'submit': {
        if (!playerId || state.phase !== 'underway') return;
        state = submitMove(state, playerId, msg.sheetIndex, msg.move);
        broadcastState();
        return;
      }

      case 'reset': {
        // Implemented in Phase 8
        return;
      }
    }
  }

  wss.on('connection', (ws) => {
    clients.set(ws, null);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as ClientMessage;
        handleMessage(ws, msg);
      } catch {
        send(ws, { type: 'error', message: 'Invalid message' });
      }
    });

    ws.on('close', () => {
      const playerId = clients.get(ws);
      clients.delete(ws);
      if (playerId) {
        state = removePlayer(state, playerId);
        broadcastState();
      }
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  return server;
}
