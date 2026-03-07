import path from 'node:path';
import http from 'node:http';
import express from 'express';
import type { GameType } from './types.js';
import { getGameModule } from './game-module.js';
import { attachWebSocketTransport } from './transports/websocket.js';
import { createOrchestrator } from './orchestrator.js';

export function createServer(password: string, gameType: GameType = 'epyc') {
  const app = express();
  const server = http.createServer(app);

  const { handler } = createOrchestrator({
    gameModule: getGameModule(gameType),
    gameType,
    password,
  });

  attachWebSocketTransport(server, handler);

  app.get('/api/game-type', (_req, res) => {
    res.json({ gameType });
  });

  // Serve built client files
  const clientDir = path.resolve(import.meta.dirname, '..', 'dist', 'client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  return server;
}
