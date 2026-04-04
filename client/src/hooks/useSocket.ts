import { useState, useCallback, useRef, useEffect } from 'react';
import type { ClientMessage, ServerMessage, ClientGameState, GameType } from '../types';
import type { RelayPayload } from '../types';
import type { ClientTransport } from '../transport';
import { connectWebSocket } from '../transports/websocket';

type AddWordResult = { success: boolean; message: string } | null;

type SocketState = {
  gameState: ClientGameState | null;
  playerId: string | null;
  gameType: GameType | null;
  error: string | null;
  connected: boolean;
  addWordResult: AddWordResult;
};

const RECONNECT_DELAYS = [500, 1000, 2000, 4000];

export function useSocket() {
  const [state, setState] = useState<SocketState>({
    gameState: null,
    playerId: null,
    gameType: null,
    error: null,
    connected: false,
    addWordResult: null,
  });

  useEffect(() => {
    fetch('/api/game-type')
      .then(res => res.json())
      .then(data => setState(s => ({ ...s, gameType: data.gameType })))
      .catch(() => {});
  }, []);
  const transportRef = useRef<ClientTransport | null>(null);
  const relayListenersRef = useRef<Set<(payload: RelayPayload) => void>>(new Set());
  const credentialsRef = useRef<{ password: string; handle: string } | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  function openConnection(password: string, handle: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    console.log(`[ws] connecting to ${url}`);

    const transport = connectWebSocket(url, {
      onOpen() {
        console.log('[ws] connected, sending join');
        reconnectAttemptRef.current = 0;
        setState(s => ({ ...s, connected: true, error: null }));
        transport.send(JSON.stringify({ type: 'join', password, handle } satisfies ClientMessage));
      },
      onMessage(data) {
        const msg: ServerMessage = JSON.parse(data);
        switch (msg.type) {
          case 'joined':
            console.log(`[ws] joined as player=${msg.playerId}`);
            setState(s => ({ ...s, playerId: msg.playerId, gameType: msg.gameType }));
            break;
          case 'state':
            setState(s => ({ ...s, gameState: msg.state }));
            break;
          case 'error':
            console.log(`[ws] server error: ${msg.message}`);
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
      },
      onClose() {
        console.log('[ws] disconnected');
        setState(s => ({ ...s, connected: false }));
        transportRef.current = null;
        scheduleReconnect();
      },
    });

    transportRef.current = transport;
  }

  function scheduleReconnect() {
    if (!credentialsRef.current) return;
    const attempt = reconnectAttemptRef.current;
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
    console.log(`[ws] reconnecting in ${delay}ms (attempt ${attempt + 1})`);
    reconnectAttemptRef.current = attempt + 1;
    reconnectTimerRef.current = setTimeout(() => {
      if (credentialsRef.current) {
        openConnection(credentialsRef.current.password, credentialsRef.current.handle);
      }
    }, delay);
  }

  const connect = useCallback((password: string, handle: string) => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (transportRef.current) {
      transportRef.current.close();
      transportRef.current = null;
    }
    credentialsRef.current = { password, handle };
    reconnectAttemptRef.current = 0;
    openConnection(password, handle);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (!transportRef.current) {
      console.log(`[ws] send dropped (no connection): ${msg.type}`);
      return;
    }
    console.log(`[ws] send: ${msg.type}`);
    transportRef.current.send(JSON.stringify(msg));
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
