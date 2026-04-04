import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Connection, TransportHandler } from '../transport.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function attachWebSocketTransport(httpServer: http.Server, handler: TransportHandler): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  let nextId = 1;
  const alive = new Map<WebSocket, boolean>();

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        alive.delete(ws);
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));

    const conn: Connection = {
      id: String(nextId++),
      send(data) {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
      close() {
        ws.close();
      },
    };

    handler.onConnect(conn);
    ws.on('message', (raw) => handler.onMessage(conn, String(raw)));
    ws.on('close', () => {
      alive.delete(ws);
      handler.onDisconnect(conn);
    });
  });
}
