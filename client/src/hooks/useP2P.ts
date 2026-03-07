import { useState, useCallback, useRef, useEffect } from 'react';
import Peer from 'peerjs';
import type { ClientMessage, ServerMessage, ClientGameState, GameType } from '../types';
import type { RelayPayload } from '../types';
import type { ClientTransport } from '../transport';
import type { Connection } from '../../../server/transport.js';
import { createOrchestrator } from '../../../server/orchestrator.js';
import type { Orchestrator } from '../../../server/orchestrator.js';
import { getGameModule } from '../../../server/game-module.js';
import { configureWords } from '../../../server/games/pictionary/words.js';
import type { WordEntry } from '../../../server/games/pictionary/words.js';
import { createLocalConnection } from '../transports/local';
import bundledWords from '../../../server/games/pictionary/word-list.json';

const PEER_PREFIX = 'poop-deli-';
const LS_KEY = 'poop-deli-custom-words';

function loadAndConfigureWords() {
  const base: WordEntry[] = bundledWords as WordEntry[];
  let custom: WordEntry[] = [];
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) custom = JSON.parse(stored);
  } catch { /* ignore */ }

  const baseSet = new Set(base.map(w => w.word.toLowerCase()));
  const merged = [...base, ...custom.filter(w => !baseSet.has(w.word.toLowerCase()))];

  configureWords(merged, (words) => {
    const customOnly = words.filter(w => !baseSet.has(w.word.toLowerCase()));
    localStorage.setItem(LS_KEY, JSON.stringify(customOnly));
  });
}

type AddWordResult = { success: boolean; message: string } | null;

type P2PState = {
  gameState: ClientGameState | null;
  playerId: string | null;
  gameType: GameType;
  error: string | null;
  connected: boolean;
  addWordResult: AddWordResult;
  roomName: string | null;
  isHost: boolean | null;
};

export function useP2P(gameType: GameType, initialRoomName?: string) {
  const [state, setState] = useState<P2PState>({
    gameState: null,
    playerId: null,
    gameType,
    error: null,
    connected: false,
    addWordResult: null,
    roomName: initialRoomName ?? null,
    isHost: null,
  });

  const orchestratorRef = useRef<Orchestrator | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const transportRef = useRef<ClientTransport | null>(null);
  const relayListenersRef = useRef<Set<(payload: RelayPayload) => void>>(new Set());

  useEffect(() => {
    return () => {
      transportRef.current?.close();
      orchestratorRef.current?.destroy();
      peerRef.current?.destroy();
    };
  }, []);

  const handleServerMessage = useCallback((data: string) => {
    const msg: ServerMessage = JSON.parse(data);
    switch (msg.type) {
      case 'joined':
        setState(s => ({ ...s, playerId: msg.playerId }));
        break;
      case 'state':
        setState(s => ({ ...s, gameState: msg.state }));
        break;
      case 'error':
        setState(s => ({ ...s, error: msg.message }));
        break;
      case 'add-word-result':
        setState(s => ({ ...s, addWordResult: { success: msg.success, message: msg.message } }));
        break;
      case 'relay':
        for (const listener of relayListenersRef.current) {
          listener(msg.payload);
        }
        break;
    }
  }, []);

  const connect = useCallback((roomName: string, handle: string) => {
    if (transportRef.current || peerRef.current) return;

    const fullPeerId = PEER_PREFIX + roomName;
    setState(s => ({ ...s, roomName, error: null }));

    // Try to claim the room name as host
    const peer = new Peer(fullPeerId);
    peerRef.current = peer;

    peer.on('open', () => {
      // We're the host — set up orchestrator and accept guests
      setState(s => ({ ...s, isHost: true }));

      loadAndConfigureWords();
      const gameModule = getGameModule(gameType);
      const orchestrator = createOrchestrator({ gameModule, gameType, password: null });
      orchestratorRef.current = orchestrator;

      // Wire incoming PeerJS connections to orchestrator
      let nextId = 2; // 1 reserved for local
      peer.on('connection', (dataConn) => {
        const connId = String(nextId++);
        const conn: Connection = {
          id: connId,
          send(data) { if (dataConn.open) dataConn.send(data); },
        };
        dataConn.on('open', () => orchestrator.handler.onConnect(conn));
        dataConn.on('data', (data) => orchestrator.handler.onMessage(conn, data as string));
        dataConn.on('close', () => orchestrator.handler.onDisconnect(conn));
        dataConn.on('error', () => orchestrator.handler.onDisconnect(conn));
      });

      // Create local connection for the host player
      const transport = createLocalConnection(orchestrator.handler, {
        onOpen() {
          setState(s => ({ ...s, connected: true }));
          transport.send(JSON.stringify({ type: 'join', password: '', handle } satisfies ClientMessage));
        },
        onMessage: handleServerMessage,
        onClose() {
          setState(s => ({ ...s, connected: false }));
          transportRef.current = null;
        },
      });
      transportRef.current = transport;
    });

    peer.on('error', (err: any) => {
      if (err.type === 'unavailable-id') {
        // Room already exists — join as guest
        peer.destroy();
        peerRef.current = null;
        setState(s => ({ ...s, isHost: false }));

        const guestPeer = new Peer();
        peerRef.current = guestPeer;

        guestPeer.on('open', () => {
          const dataConn = guestPeer.connect(fullPeerId, { reliable: true });
          let connected = false;

          dataConn.on('open', () => {
            connected = true;
            setState(s => ({ ...s, connected: true }));
            const transport: ClientTransport = {
              send(data) { if (connected) dataConn.send(data); },
              close() { connected = false; dataConn.close(); guestPeer.destroy(); },
            };
            transportRef.current = transport;
            transport.send(JSON.stringify({ type: 'join', password: '', handle } satisfies ClientMessage));
          });
          dataConn.on('data', (data) => handleServerMessage(data as string));
          dataConn.on('close', () => {
            connected = false;
            setState(s => ({ ...s, connected: false }));
            transportRef.current = null;
          });
          dataConn.on('error', () => {
            if (connected) {
              connected = false;
              setState(s => ({ ...s, connected: false }));
              transportRef.current = null;
            }
          });
        });

        guestPeer.on('error', (guestErr: any) => {
          setState(s => ({ ...s, error: 'Failed to join room: ' + (guestErr.message || guestErr.type) }));
        });
      } else {
        setState(s => ({ ...s, error: 'Failed to create room: ' + (err.message || err.type) }));
        peer.destroy();
        peerRef.current = null;
      }
    });
  }, [gameType, handleServerMessage]);

  const send = useCallback((msg: ClientMessage) => {
    transportRef.current?.send(JSON.stringify(msg));
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  const clearAddWordResult = useCallback(() => {
    setState(s => ({ ...s, addWordResult: null }));
  }, []);

  const onRelay = useCallback((listener: (payload: RelayPayload) => void) => {
    relayListenersRef.current.add(listener);
    return () => { relayListenersRef.current.delete(listener); };
  }, []);

  return { ...state, connect, send, clearError, clearAddWordResult, onRelay };
}
