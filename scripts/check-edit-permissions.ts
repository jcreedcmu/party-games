// Reports which library cards a given player may edit, against a running
// bwc server. Read-only: it joins, reads one state, and leaves.
// Run: npx tsx scripts/check-edit-permissions.ts <port> <handle>
import WebSocket from 'ws';
import type { ServerMessage } from '../server/protocol.js';

const port = process.argv[2] ?? '3461';
const handle = process.argv[3] ?? 'Nobody';

const ws = new WebSocket(`ws://localhost:${port}/ws`);
await new Promise<void>(resolve => ws.on('open', () => resolve()));
ws.send(JSON.stringify({ type: 'join', password: 'secret', handle, clientId: `probe-${handle}` }));

const state = await new Promise<ServerMessage>(resolve => {
  ws.on('message', raw => {
    const msg: ServerMessage = JSON.parse(String(raw));
    if (msg.type === 'state') resolve(msg);
  });
});
ws.close();

if (state.type !== 'state' || state.state.phase !== 'bwc-waiting') throw new Error('expected a waiting state');
const cards = state.state.library.map(id => state.state.cards[id]);
const editable = cards.filter(c => c.editable);
const blanks = editable.filter(c => !c.name && !c.text);
console.log(`as "${handle}": ${editable.length} of ${cards.length} cards editable ` +
  `(${blanks.length} of them unfilled blanks)`);
const named = editable.filter(c => c.name || c.text).slice(0, 3);
for (const c of named) console.log(`  editable: ${c.name || '(untitled)'} by ${c.creatorHandle || '(nobody)'}`);
const locked = cards.filter(c => !c.editable);
for (const c of locked) console.log(`  locked:   ${c.name || '(untitled)'} by ${c.creatorHandle}`);
