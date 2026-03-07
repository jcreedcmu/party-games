import { useState, useCallback, useRef } from 'react';
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

export function useSocket() {
  const [state, setState] = useState<SocketState>({
    gameState: null,
    playerId: null,
    gameType: null,
    error: null,
    connected: false,
    addWordResult: null,
  });
  const transportRef = useRef<ClientTransport | null>(null);
  const relayListenersRef = useRef<Set<(payload: RelayPayload) => void>>(new Set());

  const connect = useCallback((password: string, handle: string) => {
    if (transportRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    const transport = connectWebSocket(url, {
      onOpen() {
        setState(s => ({ ...s, connected: true, error: null }));
        transport.send(JSON.stringify({ type: 'join', password, handle } satisfies ClientMessage));
      },
      onMessage(data) {
        const msg: ServerMessage = JSON.parse(data);
        switch (msg.type) {
          case 'joined':
            setState(s => ({ ...s, playerId: msg.playerId, gameType: msg.gameType }));
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
      },
      onClose() {
        setState(s => ({ ...s, connected: false }));
        transportRef.current = null;
      },
    });

    transportRef.current = transport;
  }, []);

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
