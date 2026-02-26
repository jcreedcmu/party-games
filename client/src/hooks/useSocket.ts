import { useState, useCallback, useRef } from 'react';
import type { ClientMessage, ServerMessage, ClientGameState, GameType } from '../types';
import type { RelayPayload } from '../types';

type SocketState = {
  gameState: ClientGameState | null;
  playerId: string | null;
  gameType: GameType | null;
  error: string | null;
  connected: boolean;
};

export function useSocket() {
  const [state, setState] = useState<SocketState>({
    gameState: null,
    playerId: null,
    gameType: null,
    error: null,
    connected: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const relayListenersRef = useRef<Set<(payload: RelayPayload) => void>>(new Set());

  const connect = useCallback((password: string, handle: string) => {
    if (wsRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(s => ({ ...s, connected: true, error: null }));
      ws.send(JSON.stringify({ type: 'join', password, handle } satisfies ClientMessage));
    };

    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data);
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
        case 'relay':
          for (const listener of relayListenersRef.current) {
            listener(msg.payload);
          }
          break;
      }
    };

    ws.onclose = () => {
      setState(s => ({ ...s, connected: false }));
      wsRef.current = null;
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  const onRelay = useCallback((listener: (payload: RelayPayload) => void) => {
    relayListenersRef.current.add(listener);
    return () => { relayListenersRef.current.delete(listener); };
  }, []);

  return { ...state, connect, send, clearError, onRelay };
}
