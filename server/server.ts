import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from './protocol.js';
import type { GameType, PlayerId, ServerState } from './types.js';
import {
  createInitialState as epycCreateInitialState,
  addPlayer as epycAddPlayer,
  removePlayer as epycRemovePlayer,
  setReady as epycSetReady,
  checkAllReady as epycCheckAllReady,
  submitMove as epycSubmitMove,
  checkRoundComplete as epycCheckRoundComplete,
  advanceRound as epycAdvanceRound,
  resetGame as epycResetGame,
} from './games/epyc/state.js';
import { getClientState as epycGetClientState } from './games/epyc/client-state.js';

function createGameInitialState(gameType: GameType): ServerState {
  switch (gameType) {
    case 'epyc': return epycCreateInitialState();
    case 'pictionary': throw new Error('Pictionary not yet implemented');
  }
}

function getClientState(state: ServerState, playerId: PlayerId) {
  switch (state.phase) {
    case 'epyc-waiting':
    case 'epyc-underway':
    case 'epyc-postgame':
      return epycGetClientState(state, playerId);
  }
}

export function createServer(password: string, gameType: GameType = 'epyc') {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let state: ServerState = createGameInitialState(gameType);
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
    if (state.phase !== 'epyc-underway') return;
    const delay = Math.max(0, state.roundDeadline - Date.now());
    roundTimer = setTimeout(() => {
      if (state.phase !== 'epyc-underway') return;
      state = epycAdvanceRound(state);
      if (state.phase === 'epyc-underway') {
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
        if (state.phase !== 'epyc-waiting') {
          send(ws, { type: 'error', message: 'Game already in progress' });
          return;
        }
        const result = epycAddPlayer(state, msg.handle);
        state = result.state;
        clients.set(ws, result.playerId);
        send(ws, { type: 'joined', playerId: result.playerId, gameType });
        broadcastState();
        return;
      }

      case 'ready':
      case 'unready': {
        if (!playerId || state.phase !== 'epyc-waiting') return;
        state = epycSetReady(state, playerId, msg.type === 'ready');
        state = epycCheckAllReady(state);
        if (state.phase === 'epyc-underway') {
          startRoundTimer();
        }
        broadcastState();
        return;
      }

      case 'submit': {
        if (!playerId || state.phase !== 'epyc-underway') return;
        state = epycSubmitMove(state, playerId, msg.move);
        state = epycCheckRoundComplete(state);
        if (state.phase === 'epyc-underway') {
          startRoundTimer();
        } else if (state.phase === 'epyc-postgame') {
          clearRoundTimer();
        }
        broadcastState();
        return;
      }

      case 'reset': {
        if (state.phase !== 'epyc-postgame') return;
        clearRoundTimer();
        state = epycResetGame(state);
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
        state = epycRemovePlayer(state, playerId);
        if (state.phase === 'epyc-underway') {
          state = epycCheckRoundComplete(state);
          if (state.phase === 'epyc-underway') {
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
