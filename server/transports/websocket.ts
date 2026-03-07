import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Connection, TransportHandler } from '../transport.js';

export function attachWebSocketTransport(httpServer: http.Server, handler: TransportHandler): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  let nextId = 1;

  wss.on('connection', (ws) => {
    const conn: Connection = {
      id: String(nextId++),
      send(data) {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
    };

    handler.onConnect(conn);
    ws.on('message', (raw) => handler.onMessage(conn, String(raw)));
    ws.on('close', () => handler.onDisconnect(conn));
  });
}
