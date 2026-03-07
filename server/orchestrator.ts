import type { ClientMessage, ServerMessage } from './protocol.js';
import type { GameType, PlayerId, ServerState, ReduceResult, RelayMessage } from './types.js';
import type { ConnectionId, Connection, TransportHandler } from './transport.js';
import type { GameModule } from './game-module.js';

export type OrchestratorConfig = {
  gameModule: GameModule;
  gameType: GameType;
  password: string | null; // null = skip password check (P2P mode)
};

export type Orchestrator = {
  handler: TransportHandler;
  destroy: () => void;
};

export function createOrchestrator(config: OrchestratorConfig): Orchestrator {
  const { gameModule, gameType, password } = config;

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

  const handler: TransportHandler = {
    onConnect(conn) {
      clients.set(conn.id, { conn, playerId: null });
    },

    onMessage(conn, data) {
      try {
        const msg = JSON.parse(data) as ClientMessage;
        const entry = clients.get(conn.id);
        if (!entry) return;

        if (msg.type === 'join') {
          if (entry.playerId) {
            sendTo(conn, { type: 'error', message: 'Already joined' });
            return;
          }
          if (password !== null && msg.password !== password) {
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

      const hasPlayers = Array.from(clients.values()).some(e => e.playerId !== null);
      if (!hasPlayers) {
        clearGameTimer();
        state = gameModule.createInitialState();
      }
    },
  };

  function destroy() {
    clearGameTimer();
  }

  return { handler, destroy };
}
