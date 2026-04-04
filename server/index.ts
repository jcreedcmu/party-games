import fs from 'node:fs';
import path from 'node:path';
import { createServer } from './server.js';
import type { GameType } from './types.js';
import { configureWords, configureStats } from './games/pictionary/words.js';
import type { WordStats } from './games/pictionary/words.js';

function parseArgs(args: string[]): { password: string; port: number; host: string; game: GameType } {
  let password = '';
  let port = 3000;
  let host = 'localhost';
  let game: GameType = 'epyc';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--password' && i + 1 < args.length) {
      password = args[i + 1];
      i++;
    } else if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--host' && i + 1 < args.length) {
      host = args[i + 1];
      i++;
    } else if (args[i] === '--game' && i + 1 < args.length) {
      const g = args[i + 1];
      if (g !== 'epyc' && g !== 'pictionary') {
        console.error(`Unknown game type: ${g}. Must be 'epyc' or 'pictionary'.`);
        process.exit(1);
      }
      game = g;
      i++;
    }
  }

  if (!password) {
    console.error('Usage: tsx server/index.ts --password <password> [--port <port>] [--game <epyc|pictionary>]');
    process.exit(1);
  }

  return { password, port, host, game };
}

const { password, port, host, game } = parseArgs(process.argv.slice(2));

// Configure word list for pictionary
const wordListPath = path.resolve(import.meta.dirname, 'games/pictionary/word-list.json');
const words = JSON.parse(fs.readFileSync(wordListPath, 'utf-8'));
configureWords(words, (updated) => {
  try {
    fs.writeFileSync(wordListPath, JSON.stringify(updated, null, 2) + '\n');
    return true;
  } catch (e) {
    console.error('Failed to persist word list:', e);
    return false;
  }
});

// Configure word stats
const statsPath = path.resolve(import.meta.dirname, 'games/pictionary/word-stats.json');
let stats: Record<string, WordStats> = {};
try {
  stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
} catch {
  // No stats file yet, start fresh
}
configureStats(stats, (updated) => {
  try {
    fs.writeFileSync(statsPath, JSON.stringify(updated, null, 2) + '\n');
  } catch (e) {
    console.error('Failed to persist word stats:', e);
  }
});

const server = createServer(password, game);

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port} (game: ${game})`);
});
