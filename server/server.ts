import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, DrawOp, RelayPayload } from './protocol.js';
import type { GameType, PlayerId, ServerState, RelayMessage } from './types.js';
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
import {
  createInitialState as picCreateInitialState,
  addPlayer as picAddPlayer,
  removePlayer as picRemovePlayer,
  setReady as picSetReady,
  checkAllReady as picCheckAllReady,
  getCurrentDrawer as picGetCurrentDrawer,
  recordDrawOp as picRecordDrawOp,
  submitGuess as picSubmitGuess,
  checkTurnComplete as picCheckTurnComplete,
  shortenDeadline as picShortenDeadline,
  advanceTurn as picAdvanceTurn,
  resetGame as picResetGame,
} from './games/pictionary/state.js';
import { addWord as picAddWord } from './games/pictionary/words.js';
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
        for (const [ws, pid] of clients) {
          if (pid === targetId) {
            send(ws, msg);
          }
        }
      }
    }
  }

  function clearGameTimer() {
    if (gameTimer) {
      clearTimeout(gameTimer);
      gameTimer = null;
    }
  }

  function startRoundTimer() {
    clearGameTimer();
    if (state.phase !== 'epyc-underway') return;
    const delay = Math.max(0, state.roundDeadline - Date.now());
    gameTimer = setTimeout(() => {
      if (state.phase !== 'epyc-underway') return;
      state = epycAdvanceRound(state);
      if (state.phase === 'epyc-underway') {
        startRoundTimer();
      }
      broadcastState();
    }, delay);
  }

  function startTurnTimer() {
    clearGameTimer();
    if (state.phase !== 'pictionary-active') return;
    const delay = Math.max(0, state.turnDeadline - Date.now());
    gameTimer = setTimeout(() => {
      if (state.phase !== 'pictionary-active') return;
      state = picAdvanceTurn(state);
      if (state.phase === 'pictionary-active') {
        startTurnTimer();
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

      case 'ready':
      case 'unready': {
        if (!playerId) return;
        if (state.phase === 'epyc-waiting') {
          state = epycSetReady(state, playerId, msg.type === 'ready');
          state = epycCheckAllReady(state);
          if (state.phase === 'epyc-underway') {
            startRoundTimer();
          }
        } else if (state.phase === 'pictionary-waiting') {
          state = picSetReady(state, playerId, msg.type === 'ready');
          state = picCheckAllReady(state);
          if (state.phase === 'pictionary-active') {
            startTurnTimer();
          }
        } else {
          return;
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
          clearGameTimer();
        }
        broadcastState();
        return;
      }

      case 'reset': {
        if (state.phase === 'epyc-postgame') {
          clearGameTimer();
          state = epycResetGame(state);
        } else if (state.phase === 'pictionary-postgame') {
          clearGameTimer();
          state = picResetGame(state);
        } else {
          return;
        }
        broadcastState();
        return;
      }

      case 'draw-start':
      case 'draw-move':
      case 'draw-end':
      case 'draw-fill':
      case 'draw-undo':
      case 'draw-clear': {
        if (!playerId || state.phase !== 'pictionary-active') return;
        const drawerId = picGetCurrentDrawer(state);
        if (playerId !== drawerId) return;
        state = picRecordDrawOp(state, msg as DrawOp);
        const targets = Array.from(state.players.entries())
          .filter(([id, p]) => id !== drawerId && p.connected)
          .map(([id]) => id);
        forwardRelays([{ to: targets, payload: msg as RelayPayload }]);
        return;
      }

      case 'guess': {
        if (!playerId || state.phase !== 'pictionary-active') return;
        const guessResult = picSubmitGuess(state, playerId, msg.text);
        state = guessResult.state;

        // Relay guess result to all connected players
        const handle = guessResult.state.players.get(playerId)!.handle;
        const allConnected = Array.from(guessResult.state.players.entries())
          .filter(([, p]) => p.connected)
          .map(([id]) => id);
        forwardRelays([{
          to: allConnected,
          payload: {
            type: 'guess-result',
            handle,
            correct: guessResult.correct,
            text: guessResult.correct ? null : msg.text,
          },
        }]);

        // If all guessers are correct, shorten the deadline to give drawer a grace period
        if (guessResult.correct && picCheckTurnComplete(guessResult.state)) {
          state = picShortenDeadline(guessResult.state);
          startTurnTimer();
        }
        broadcastState();
        return;
      }

      case 'turn-done': {
        if (!playerId || state.phase !== 'pictionary-active') return;
        if (playerId !== picGetCurrentDrawer(state)) return;
        state = picAdvanceTurn(state);
        if (state.phase === 'pictionary-active') {
          startTurnTimer();
        } else {
          clearGameTimer();
        }
        broadcastState();
        return;
      }

      case 'add-word': {
        if (!playerId) return;
        const handle = state.players.get(playerId)?.handle ?? 'unknown';
        const word = msg.word.trim().toLowerCase();
        const added = picAddWord(msg.word, handle);
        if (added) {
          send(ws, { type: 'add-word-result', success: true, message: `"${word}" added!` });
        } else {
          send(ws, { type: 'add-word-result', success: false, message: word ? `"${word}" already exists.` : 'Word cannot be empty.' });
        }
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
      if (!playerId) return;

      // Dispatch disconnect by game phase
      switch (state.phase) {
        case 'epyc-waiting':
        case 'epyc-underway':
        case 'epyc-postgame': {
          state = epycRemovePlayer(state, playerId);
          if (state.phase === 'epyc-underway') {
            state = epycCheckRoundComplete(state);
            if (state.phase === 'epyc-underway') {
              startRoundTimer();
            } else {
              clearGameTimer();
            }
          }
          break;
        }
        case 'pictionary-waiting':
        case 'pictionary-postgame': {
          state = picRemovePlayer(state, playerId);
          break;
        }
        case 'pictionary-active': {
          const wasDrawer = picGetCurrentDrawer(state) === playerId;
          state = picRemovePlayer(state, playerId);
          if (state.phase === 'pictionary-active') {
            if (wasDrawer || picCheckTurnComplete(state)) {
              state = picAdvanceTurn(state);
              if (state.phase === 'pictionary-active') {
                startTurnTimer();
              } else {
                clearGameTimer();
              }
            }
          }
          break;
        }
      }
      broadcastState();
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
