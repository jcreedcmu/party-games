import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';

export function createServer(password: string) {
  const app = express();
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      // TODO: handle messages in Phase 4
    });

    ws.on('close', () => {
      // TODO: handle disconnect in Phase 4
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  return server;
}
