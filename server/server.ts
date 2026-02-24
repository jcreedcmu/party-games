import path from 'node:path';
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
  checkRoundComplete,
  advanceRound,
  resetGame,
  getClientState,
} from './state.js';

export function createServer(password: string) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let state: GameState = createInitialState();
  const clients = new Map<WebSocket, PlayerId | null>();
  let roundTimer: ReturnType<typeof setTimeout> | null = null;

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

  function clearRoundTimer() {
    if (roundTimer) {
      clearTimeout(roundTimer);
      roundTimer = null;
    }
  }

  function startRoundTimer() {
    clearRoundTimer();
    if (state.phase !== 'underway') return;
    const delay = Math.max(0, state.roundDeadline - Date.now());
    roundTimer = setTimeout(() => {
      if (state.phase !== 'underway') return;
      state = advanceRound(state);
      if (state.phase === 'underway') {
        startRoundTimer();
      }
      broadcastState();
    }, delay);
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
        if (state.phase === 'underway') {
          startRoundTimer();
        }
        broadcastState();
        return;
      }

      case 'submit': {
        if (!playerId || state.phase !== 'underway') return;
        state = submitMove(state, playerId, msg.move);
        state = checkRoundComplete(state);
        if (state.phase === 'underway') {
          startRoundTimer();
        } else if (state.phase === 'postgame') {
          clearRoundTimer();
        }
        broadcastState();
        return;
      }

      case 'reset': {
        if (state.phase !== 'postgame') return;
        clearRoundTimer();
        state = resetGame(state);
        broadcastState();
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
        if (state.phase === 'underway') {
          state = checkRoundComplete(state);
          if (state.phase === 'underway') {
            startRoundTimer();
          } else {
            clearRoundTimer();
          }
        }
        broadcastState();
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
