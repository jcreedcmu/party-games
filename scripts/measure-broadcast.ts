// Reports the size of a bwc state broadcast against the stored library.
// Run: npx tsx scripts/measure-broadcast.ts <port>
import WebSocket from 'ws';
import type { ServerMessage } from '../server/protocol.js';

const port = process.argv[2] ?? '3459';
const ws = new WebSocket(`ws://localhost:${port}/ws`);

const sizes: Array<{ label: string; bytes: number }> = [];

await new Promise<void>(resolve => ws.on('open', () => resolve()));
ws.send(JSON.stringify({ type: 'join', password: 'secret', handle: 'Probe', clientId: 'probe-1' }));

let seen = 0;
await new Promise<void>(resolve => {
  ws.on('message', raw => {
    const text = String(raw);
    const msg: ServerMessage = JSON.parse(text);
    if (msg.type !== 'state') return;
    sizes.push({ label: `state #${++seen} (${msg.state.phase})`, bytes: Buffer.byteLength(text) });
    if (seen >= 1) resolve();
  });
});

for (const s of sizes) console.log(`${s.label}: ${s.bytes.toLocaleString()} bytes`);
ws.close();
