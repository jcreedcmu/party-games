Implementation Plan
===================

This plan breaks the project into incremental steps. Each step should
result in something testable (either via unit tests or manual
verification). Steps should be done in order.

Step 1: Project Scaffolding
----------------------------

Set up the monorepo-style directory structure:

```
poop-deli/
  package.json          # root, with scripts for building/running
  tsconfig.json         # base tsconfig
  src/
    common/
      types.ts          # shared types between client and server
    server/
      tsconfig.json
      index.ts          # entry point, sets up express + ws
      game.ts           # game state machine
    client/
      tsconfig.json
      index.html        # entry point HTML
      index.tsx         # React root
      App.tsx
      style.css
```

- Initialize `package.json` with dependencies:
  - **Server:** express, ws, typescript, ts-node
  - **Client:** react, react-dom, typescript
  - **Build/dev:** esbuild (for bundling the client), @types packages
- Set up tsconfig files. The base tsconfig enables strict mode. Server
  and client extend it with appropriate module/target settings.
- Add npm scripts: `build` (compile server + bundle client), `start`
  (run server), `dev` (watch mode).
- Verify: `npm run build` succeeds and `npm start` serves a "hello
  world" page.

Step 2: Shared Types
---------------------

Define the core types in `src/common/types.ts`:

- `GamePhase`: `'waiting' | 'underway' | 'postgame'`
- `MoveType`: `'text' | 'picture'`
- `Move`: `{ type: MoveType; content: string; playerName: string }`
  - For text moves, `content` is the text string.
  - For picture moves, `content` is a data URL (PNG from the canvas).
- `Sheet`: `{ moves: Move[] }`
- `PlayerInfo`: `{ name: string }`
- Messages from server to client (sent over WebSocket):
  - `GameStateMsg`: full state sync (phase, players, ready statuses,
    which sheet the player currently has, timer remaining, etc.)
  - `PostgameMsg`: all sheets for browsing
- Messages from client to server:
  - `JoinMsg`: `{ type: 'join'; name: string; password: string }`
  - `ReadyMsg`: `{ type: 'ready' }`
  - `SubmitMoveMsg`: `{ type: 'submitMove'; content: string }`

Verify: types compile cleanly.

Step 3: Server — Game State Machine
-------------------------------------

Implement `src/server/game.ts` with a `Game` class:

- Internal state:
  - `phase: GamePhase`
  - `players: Map<string, PlayerInfo>` (keyed by connection id)
  - `readySet: Set<string>`
  - `cyclicOrder: string[]` (player ids in shuffled order)
  - `sheets: Sheet[]` (one per player)
  - `currentRound: number`
  - `initialMoveType: MoveType` (randomly chosen at game start)
  - `roundTimer: NodeJS.Timeout | null`
  - `roundEndTime: number` (timestamp)
- Methods:
  - `addPlayer(id, name)` — add player during waiting phase
  - `removePlayer(id)` — remove player (handle mid-game gracefully)
  - `setReady(id)` — mark player ready; if all ready, start game
  - `startGame()` — shuffle players, create sheets, start first round
  - `submitMove(id, content)` — record a move on the player's current sheet
  - `advanceRound()` — called when timer fires; rotate sheets; if all
    rounds done, transition to postgame
  - `getStateForPlayer(id)` — return the view of state that a
    specific player should see
  - `getPostgameState()` — return all sheets for browsing
- Helper: `currentMoveType(round)` — alternates starting from
  `initialMoveType`.
- Helper: `sheetIndexForPlayer(playerId, round)` — which sheet a
  given player works on in a given round.

Write unit tests for the Game class:
- Adding/removing players
- Ready-up logic triggers game start
- Cyclic rotation of sheets
- Move type alternation
- Postgame transition after all rounds

Verify: `npm test` passes.

Step 4: Server — HTTP and WebSocket Endpoints
-----------------------------------------------

Implement `src/server/index.ts`:

- Create an Express app.
- Serve the client's bundled files from a `dist/client` directory (or
  similar) as static assets.
- Set up a `ws` WebSocket server attached to the HTTP server.
- Accept a `--password` command-line argument (default: no password
  required).
- On WebSocket connection:
  - Wait for a `JoinMsg`. Validate password. If invalid, send an
    error and close. If valid, add player to the game.
  - On subsequent messages, dispatch to the appropriate `Game` method.
  - After each state change, broadcast updated `GameStateMsg` to all
    connected players.
  - On disconnect, remove player from game.
- Timer management: when a round starts, set a 60-second timer. On
  tick (every second), broadcast updated time remaining. On expiry,
  call `advanceRound()`.

Verify: can connect with a WebSocket client (e.g. `wscat`) and send
join/ready messages; see state change responses.

Step 5: Client — Join Screen
------------------------------

Implement the React app with a `JoinScreen` component:

- A text input for the player's chosen handle.
- A text input for the game password (if required).
- A "Join" button.
- On join, open a WebSocket connection to the server and send a
  `JoinMsg`.
- Show an error message (in a styled in-page modal/banner) if the
  password is wrong or name is taken.

Verify: can open the page in a browser, enter name/password, and join.

Step 6: Client — Lobby / Waiting Screen
-----------------------------------------

Implement a `LobbyScreen` component:

- Show the list of players who have joined.
- Indicate which players are "ready" (e.g. a checkmark next to their
  name).
- A "Ready" button for the current player.
- When all players are ready, the server starts the game and the
  client transitions to the game screen.

Verify: open multiple browser tabs, join with different names, click
ready, and see the game start.

Step 7: Client — Game Screen (Text Input)
-------------------------------------------

Implement a `GameScreen` component for the "underway" phase:

- Display a countdown timer for the current round.
- Show whether the player needs to supply text or a picture.
- If the sheet has a previous move, display it:
  - Previous text: render centered.
  - Previous picture: render as an image.
- For text input rounds:
  - Show a text input field.
  - Show a "Submit" button.
  - On submit, send a `SubmitMoveMsg` to the server.
- After submitting, show a "waiting for round to end" message.

Verify: start a game with text as the initial move type; type and
submit text.

Step 8: Client — Game Screen (Drawing Input)
----------------------------------------------

Add drawing support to `GameScreen`:

- Implement a `DrawingCanvas` component using an HTML `<canvas>`:
  - Mouse/touch event handlers for freehand drawing.
  - A few basic controls: color picker (small palette), brush size,
    clear button.
  - Export the canvas content as a data URL (PNG) on submit.
- On submit, send a `SubmitMoveMsg` with the data URL as content.

Verify: start a game with picture as the initial move type; draw and
submit.

Step 9: Client — Postgame Screen
-----------------------------------

Implement a `PostgameScreen` component:

- Show a list/tabs of all sheets (one per original player).
- For each sheet, display the full sequence of moves top to bottom:
  - Each move shows the player's name and their contribution (text
    rendered centered, pictures rendered as images).
- Allow scrolling/browsing through sheets.

Verify: complete a full game and see the results displayed.

Step 10: Polish and Edge Cases
-------------------------------

- Handle player disconnection mid-game gracefully: if a player
  disconnects, auto-submit a blank move for them when the round
  timer expires.
- Add a visual/audio cue when the timer is about to expire (e.g.
  last 10 seconds).
- Style the UI with CSS: make it look clean and playable. Use a
  simple, fun aesthetic.
- Ensure the in-page modal approach for errors/alerts (no native
  `alert()`/`confirm()`).
- Test with 3+ players across multiple browser windows to verify the
  full flow end-to-end.

Step 11: Final Testing
-----------------------

- Write integration tests that simulate a full game lifecycle:
  connect multiple clients, join, ready up, submit moves across
  rounds, verify postgame data.
- Verify timer behavior in tests (use fake timers).
- Test password authentication (correct and incorrect).
- Test edge cases: player joins then disconnects, all players
  disconnect, single-player game, etc.
