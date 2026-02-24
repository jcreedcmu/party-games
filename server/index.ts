import { createServer } from './server.js';

function parseArgs(args: string[]): { password: string; port: number } {
  let password = '';
  let port = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--password' && i + 1 < args.length) {
      password = args[i + 1];
      i++;
    } else if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!password) {
    console.error('Usage: tsx server/index.ts --password <password> [--port <port>]');
    process.exit(1);
  }

  return { password, port };
}

const { password, port } = parseArgs(process.argv.slice(2));
const server = createServer(password);

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
