# Implementation Plan: Eat Poop You Cat Online

## Context
Greenfield implementation of "Eat Poop You Cat" (visual telephone game) for online play. Currently only README.md and DESIGN.md exist. The game needs a Node.js/Express/TypeScript server with WebSocket support and a React/TypeScript client built with Vite.

## Key Design Decisions

- **State storage**: In-memory `GameState` discriminated union (`waiting | underway | postgame`). No database.
- **Drawing serialization**: PNG data URLs via `canvas.toDataURL()`. Simple, ~10-100KB per drawing, displayed directly in `<img>` tags.
- **Sheet rotation**: Server picks random permutation `order[]`. Sheet with `originIndex = i` starts at `order[i]`, advances to `order[(i + moves.length) % n]`. Done when `moves.length === n`.
- **WebSocket protocol**: Full state snapshots on every change (efficient for 4-10 players). Each player gets their own projection via `getClientState()` to prevent cheating.
- **Auth**: Password via CLI arg. Player sends password + handle in `join` message. WebSocket connection = session.
- **Shared types**: Client imports directly from `server/protocol.ts` (Vite's bundler resolution handles this). Fall back to `shared/` dir if needed.

## WebSocket Message Protocol

**Client -> Server**: `join` (password + handle), `ready`, `unready`, `submit` (sheetIndex + move), `reset`
**Server -> Client**: `joined` (playerId), `error` (message), `state` (phase-specific projection)

## Directory Structure
```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, .gitignore
server/  tsconfig.json, index.ts, server.ts, state.ts, types.ts, protocol.ts, __tests__/
client/  index.html, tsconfig.json, src/ (main.tsx, App.tsx, types.ts, hooks/, components/, styles/)
```

---

## Phase 1: Project Scaffolding
Set up the build pipeline so both server and client compile and run.

**Create:**
- `package.json` — deps: express, ws, react, react-dom. devDeps: typescript, vite, @vitejs/plugin-react, vitest, tsx, types, testing-library, jsdom. Scripts: `dev:server` (tsx --watch), `dev:client` (vite), `build` (vite build), `start` (tsx server/index.ts), `test` (vitest).
- `tsconfig.json` — base config (strict, ES2022, ESNext, bundler resolution)
- `server/tsconfig.json` — extends base, NodeNext module resolution
- `client/tsconfig.json` — extends base, jsx: react-jsx, DOM libs
- `vite.config.ts` — React plugin, root: client/, proxy `/ws` to Express server
- `vitest.config.ts` — jsdom for client tests, node for server tests
- `.gitignore` — node_modules, dist, .vite
- `server/index.ts` — parse `--password` and `--port` from argv, call createServer
- `server/server.ts` — Express app + ws.WebSocketServer, minimal setup
- `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx` — hello world
- `client/src/styles/main.css` — minimal reset

**Verify**: `npm install && npm run dev:server` + `npm run dev:client` → browser shows hello world.

## Phase 2: Shared Types and Protocol
Define the message protocol and game types.

**Create:**
- `server/types.ts` — PlayerId, PlayerInfo, Move (text | drawing), Sheet, GameState union
- `server/protocol.ts` — ClientMessage, ServerMessage, ClientGameState, ClientSheetView, ClientFullSheet
- `client/src/types.ts` — re-exports from server/protocol.ts

## Phase 3: Server Game State Machine
Pure-function state machine, fully unit-tested. This is the core of the game.

**Create:**
- `server/state.ts` — functions: `createInitialState`, `addPlayer`, `removePlayer`, `setReady`, `checkAllReady` (transitions to underway), `submitMove` (appends move, may transition to postgame), `getClientState` (per-player projection), helpers for current assignee/expected move type/sheet done
- `server/__tests__/state.test.ts` — tests for all transitions, edge cases, projections

**Verify**: `npm test` passes.

## Phase 4: Server WebSocket Integration
Wire the state machine to WebSocket connections.

**Modify:**
- `server/server.ts` — Map<WebSocket, PlayerId|null>, message routing (join/ready/unready/submit), state broadcast after each change, disconnect handling
- `server/__tests__/server.test.ts` — integration tests with real WS clients

## Phase 5: Client Foundation
Join dialog, waiting room, WebSocket hook.

**Create:**
- `client/src/hooks/useSocket.ts` — connect, send, state/playerId/error tracking, reconnect
- `client/src/components/Modal.tsx` — backdrop + centered content, Escape to close
- `client/src/components/JoinDialog.tsx` — password + handle inputs, error display
- `client/src/components/WaitingRoom.tsx` — player list with ready indicators, ready toggle

**Modify:** `client/src/App.tsx` — route by phase (join dialog → waiting room → game board → postgame)

**Verify**: Two browser tabs can join and ready up, triggering transition to underway.

## Phase 6: Drawing Canvas (parallel with Phase 5)
Can be built independently — pure client component.

**Create:**
- `client/src/components/DrawingCanvas.tsx` — Canvas with pointer events, pen/eraser tools, color palette, stroke width, undo stack (ImageData snapshots, capped at ~30), clear, submit via toDataURL. Uses lineJoin/lineCap round for smooth strokes.

## Phase 7: Game Board
The main gameplay UI.

**Create:**
- `client/src/components/PreviousMove.tsx` — display text centered or drawing as `<img>`
- `client/src/components/TextInput.tsx` — textarea with char limit + submit
- `client/src/components/SheetCard.tsx` — shows PreviousMove + input (drawing or text) if assigned to player, otherwise status indicator
- `client/src/components/GameBoard.tsx` — horizontally scrollable row of SheetCards, progress indicator, per-player pending counts

**Verify**: Full gameplay through 2-3 tabs to postgame transition.

## Phase 8: Postgame
Browse completed sheets.

**Create:**
- `client/src/components/SheetViewer.tsx` — vertical display of all moves with player names
- `client/src/components/PostGame.tsx` — sheet navigation (tabs/prev/next), "New Game" button

**Add:**
- `reset` message to protocol, `resetGame()` to state.ts, handler in server.ts

## Phase 9: Polish and Edge Cases

- **Reconnection**: client auto-reconnect + server re-associates by handle during underway
- **Input validation**: handle length (1-30), text length limits, data URL format, reject empty
- **Disconnect indicators**: grayed-out players, highlighted stuck sheets
- **Loading/error states**: spinners, connection error modals
- **CSS polish**: responsive layout, card shadows, hover states, consistent typography
- **Production serving**: Express serves client/dist/ in production, same-port WebSocket

## Phase 10: Final Testing and Documentation

- Fill test gaps in state.test.ts, server.test.ts
- Component tests for DrawingCanvas, WaitingRoom
- Update README.md with install, run, play, and CLI instructions

## Phase Dependency Graph
```
1 → 2 → 3 → 4 → 5 → 7 → 8 → 9 → 10
                   ↗
              6 ──╯  (parallel with 5)
```

## Verification
After each phase, run `npm test` and manually verify in the browser. Full end-to-end test: start server with `--password secret`, open 3 browser tabs, join/ready/play through all phases to postgame, browse results, reset.
