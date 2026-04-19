import fs from 'node:fs';
import path from 'node:path';
import { createServer } from './server.js';
import type { GameType } from './types.js';
import { configureWords, configureStats } from './games/pictionary/words.js';
import type { WordStats } from './games/pictionary/words.js';
import { configureLibrary, configureSnapshot, flushSnapshot } from './games/bwc/storage.js';
import { setPreloadedLibrary } from './games/bwc/state.js';

function parseArgs(args: string[]): { password: string; port: number; host: string; game: GameType } {
  let password = '';
  let port = 3000;
  let host = process.env.HOST || 'localhost';
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
      if (g !== 'epyc' && g !== 'pictionary' && g !== 'bwc') {
        console.error(`Unknown game type: ${g}. Must be 'epyc', 'pictionary', or 'bwc'.`);
        process.exit(1);
      }
      game = g;
      i++;
    }
  }

  if (!password) {
    console.error('Usage: tsx server/index.ts --password <password> [--port <port>] [--game <epyc|pictionary|bwc>]');
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

// Configure BWC card library persistence
const bwcDataDir = path.resolve(import.meta.dirname, '..', 'data', 'bwc');
fs.mkdirSync(bwcDataDir, { recursive: true });

const libraryPath = path.join(bwcDataDir, 'cards.json');
let libraryData = null;
try {
  libraryData = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'));
  console.log(`Loaded BWC card library from ${libraryPath}`);
} catch {
  // No library file yet, start fresh
}
const library = configureLibrary(libraryData, (data) => {
  try {
    fs.writeFileSync(libraryPath, JSON.stringify(data, null, 2) + '\n');
  } catch (e) {
    console.error('Failed to persist BWC card library:', e);
  }
});
setPreloadedLibrary(library);

// Configure BWC table snapshot persistence
const snapshotPath = path.join(bwcDataDir, 'table.json');
configureSnapshot((data) => {
  try {
    if (data === null) {
      // Clear snapshot on reset.
      try { fs.unlinkSync(snapshotPath); } catch { /* ignore if not found */ }
    } else {
      fs.writeFileSync(snapshotPath, JSON.stringify(data) + '\n');
    }
  } catch (e) {
    console.error('Failed to persist BWC table snapshot:', e);
  }
});

const server = createServer(password, game);

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port} (game: ${game})`);
});

// Flush snapshot on clean shutdown.
process.on('SIGINT', () => {
  flushSnapshot();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushSnapshot();
  process.exit(0);
});
