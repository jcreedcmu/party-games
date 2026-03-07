import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from './protocol.js';
import type { GameType, PlayerId, ServerState, ReduceResult, RelayMessage } from './types.js';
import {
  createInitialState as epycCreateInitialState,
  addPlayer as epycAddPlayer,
  epycReduce,
  epycReduceDisconnect,
  epycReduceTimer,
} from './games/epyc/state.js';
import { getClientState as epycGetClientState } from './games/epyc/client-state.js';
import {
  createInitialState as picCreateInitialState,
  addPlayer as picAddPlayer,
  pictionaryReduce,
  pictionaryReduceDisconnect,
  pictionaryReduceTimer,
} from './games/pictionary/state.js';
import { getClientState as picGetClientState } from './games/pictionary/client-state.js';

function createGameInitialState(gameType: GameType): ServerState {
  switch (gameType) {
    case 'epyc': return epycCreateInitialState();
    case 'pictionary': return picCreateInitialState();
  }
}

function getClientState(state: ServerState, playerId: PlayerId) {
  switch (state.phase) {
    case 'epyc-waiting':
    case 'epyc-underway':
    case 'epyc-postgame':
      return epycGetClientState(state, playerId);
    case 'pictionary-waiting':
    case 'pictionary-active':
    case 'pictionary-postgame':
      return picGetClientState(state, playerId);
  }
}

function reduceMessage(state: ServerState, playerId: PlayerId, msg: ClientMessage): ReduceResult {
  switch (state.phase) {
    case 'epyc-waiting':
    case 'epyc-underway':
    case 'epyc-postgame':
      return epycReduce(state, playerId, msg);
    case 'pictionary-waiting':
    case 'pictionary-active':
    case 'pictionary-postgame':
      return pictionaryReduce(state, playerId, msg);
  }
}

function reduceDisconnect(state: ServerState, playerId: PlayerId): ReduceResult {
  switch (state.phase) {
    case 'epyc-waiting':
    case 'epyc-underway':
    case 'epyc-postgame':
      return epycReduceDisconnect(state, playerId);
    case 'pictionary-waiting':
    case 'pictionary-active':
    case 'pictionary-postgame':
      return pictionaryReduceDisconnect(state, playerId);
  }
}

function reduceTimer(state: ServerState): ReduceResult {
  switch (state.phase) {
    case 'epyc-waiting':
    case 'epyc-underway':
    case 'epyc-postgame':
      return epycReduceTimer(state);
    case 'pictionary-waiting':
    case 'pictionary-active':
    case 'pictionary-postgame':
      return pictionaryReduceTimer(state);
  }
}

export function createServer(password: string, gameType: GameType = 'epyc') {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let state: ServerState = createGameInitialState(gameType);
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
        send(ws, { type: 'state', state: getClientState(state, playerId) });
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
      applyResult(reduceTimer(state));
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
          if (state.phase === 'epyc-waiting') {
            const result = epycAddPlayer(state, msg.handle);
            state = result.state;
            clients.set(ws, result.playerId);
            send(ws, { type: 'joined', playerId: result.playerId, gameType });
          } else if (state.phase === 'pictionary-waiting') {
            const result = picAddPlayer(state, msg.handle);
            state = result.state;
            clients.set(ws, result.playerId);
            send(ws, { type: 'joined', playerId: result.playerId, gameType });
          } else {
            send(ws, { type: 'error', message: 'Game already in progress' });
            return;
          }
          broadcastState();
          return;
        }

        if (!playerId) return;
        applyResult(reduceMessage(state, playerId, msg));
      } catch {
        send(ws, { type: 'error', message: 'Invalid message' });
      }
    });

    ws.on('close', () => {
      const playerId = clients.get(ws);
      clients.delete(ws);
      if (playerId) {
        applyResult(reduceDisconnect(state, playerId));
      }

      // Reset to initial state when all players have left
      const hasPlayers = Array.from(clients.values()).some(id => id !== null);
      if (!hasPlayers) {
        clearGameTimer();
        state = createGameInitialState(gameType);
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
