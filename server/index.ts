import { createServer } from './server.js';
import type { GameType } from './types.js';

function parseArgs(args: string[]): { password: string; port: number; game: GameType } {
  let password = '';
  let port = 3000;
  let game: GameType = 'epyc';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--password' && i + 1 < args.length) {
      password = args[i + 1];
      i++;
    } else if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
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

  return { password, port, game };
}

const { password, port, game } = parseArgs(process.argv.slice(2));
const server = createServer(password, game);

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port} (game: ${game})`);
});
