Implementation Plan
===================

Phase 1: Single-Game EPYC
--------------------------

Steps 1-10 implemented the initial EPYC ("Eat Poop You Cat") game.
See git history for details.

Phase 2: Multi-Game Generalization
------------------------------------

Generalize the server to support multiple games selected via `--game`
CLI flag. Add Pictionary as a second game.

### Architecture

Each game is a self-contained state machine with its own phases
(including lobby/waiting). The server shell is thin: WebSocket
management, password auth, JSON parsing, timer scheduling, relay
forwarding, and static file serving. All types use discriminated
unions — no `unknown` or `any`.

Server state is a single discriminated union where `phase` narrows
the type:

    type ServerState =
      | EpycWaitingState         // phase: 'epyc-waiting'
      | EpycUnderwayState        // phase: 'epyc-underway'
      | EpycPostgameState        // phase: 'epyc-postgame'
      | PictionaryWaitingState   // phase: 'pictionary-waiting'
      | PictionaryActiveState    // phase: 'pictionary-active'
      | PictionaryPostgameState  // phase: 'pictionary-postgame'

Each game fully owns its state machine (including lobby logic). Shared
code is minimal: `PlayerId`, `PlayerInfo`, `HandleResult`, `TimerAction`,
and utilities like `shuffle`.

Server dispatch:

    switch (state.phase) {
      case 'epyc-waiting':
      case 'epyc-underway':
      case 'epyc-postgame':
        return epycHandle(state, playerId, msg);
      case 'pictionary-waiting':
      case 'pictionary-active':
      case 'pictionary-postgame':
        return pictionaryHandle(state, playerId, msg);
    }

### Types

Shared types:

    type PlayerId = string;
    type GameType = 'epyc' | 'pictionary';
    type PlayerInfo = { id: PlayerId; handle: string; ready: boolean; connected: boolean };
    type TimerAction = { kind: 'start'; deadline: number } | { kind: 'clear' } | { kind: 'none' };
    type RelayMessage = { to: PlayerId[]; payload: RelayPayload };
    type HandleResult = {
      state: ServerState;
      timer: TimerAction;
      broadcast: boolean;
      relay?: RelayMessage[];
    };

Drawing operations (used in Pictionary for real-time streaming):

    type DrawStartOp = { type: 'draw-start'; color: string; size: number; x: number; y: number };
    type DrawMoveOp = { type: 'draw-move'; points: Array<{ x: number; y: number }> };
    type DrawEndOp = { type: 'draw-end' };
    type DrawFillOp = { type: 'draw-fill'; x: number; y: number; color: string };
    type DrawUndoOp = { type: 'draw-undo' };
    type DrawClearOp = { type: 'draw-clear' };
    type DrawOp = DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp;

Client-to-server messages (flat union, discriminated by `type`):

    type ClientMessage =
      | { type: 'join'; password: string; handle: string }
      | { type: 'ready' }
      | { type: 'unready' }
      | { type: 'reset' }
      | { type: 'submit'; move: { type: MoveType; content: string } }      // EPYC
      | DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp  // Pictionary draw
      | { type: 'guess'; text: string }                                     // Pictionary guess
      // (no turn-snapshot needed — server records draw ops during the turn)

Server-to-client messages:

    type RelayPayload =
      | DrawStartOp | DrawMoveOp | DrawEndOp | DrawFillOp | DrawUndoOp | DrawClearOp
      | { type: 'guess-result'; handle: string; correct: boolean; text: string | null };

    type ServerMessage =
      | { type: 'joined'; playerId: string; gameType: GameType }
      | { type: 'error'; message: string }
      | { type: 'state'; state: ClientGameState }
      | { type: 'relay'; payload: RelayPayload };

Client state projections (discriminated union by `phase`):

    type ClientGameState =
      | EpycClientWaitingState          // phase: 'epyc-waiting'
      | EpycClientUnderwayState         // phase: 'epyc-underway'
      | EpycClientPostgameState         // phase: 'epyc-postgame'
      | PictionaryClientWaitingState    // phase: 'pictionary-waiting'
      | PictionaryClientActiveState     // phase: 'pictionary-active'
      | PictionaryClientPostgameState   // phase: 'pictionary-postgame'

EPYC client states (same as Phase 1, with prefixed phase names):

    type EpycClientWaitingState = {
      phase: 'epyc-waiting';
      players: Array<{ id: string; handle: string; ready: boolean; connected: boolean }>;
    };
    type EpycClientUnderwayState = {
      phase: 'epyc-underway';
      players: Array<{ id: string; handle: string; connected: boolean; submitted: boolean }>;
      currentRound: number;
      totalRounds: number;
      expectedMoveType: MoveType;
      roundDeadline: number;
      submitted: boolean;
      previousMove: { type: MoveType; content: string } | null;
    };
    type EpycClientPostgameState = {
      phase: 'epyc-postgame';
      players: Array<{ id: string; handle: string }>;
      sheets: Array<{
        sheetIndex: number;
        moves: Array<{ type: MoveType; content: string; playerHandle: string } | null>;
      }>;
    };

Pictionary client states:

    type PictionaryClientWaitingState = {
      phase: 'pictionary-waiting';
      players: Array<{ id: string; handle: string; ready: boolean; connected: boolean }>;
    };
    type PictionaryClientActiveState = {
      phase: 'pictionary-active';
      role: 'drawer' | 'guesser';
      currentDrawerHandle: string;
      turnNumber: number;
      totalTurns: number;
      turnDeadline: number;
      word: string | null;           // non-null only for drawer
      guessedCorrectly: boolean;     // whether this player already guessed right
      correctGuessers: string[];     // handles of correct guessers
      players: Array<{
        id: string; handle: string; connected: boolean;
        score: number; guessedThisTurn: boolean;
      }>;
    };
    type PictionaryClientPostgameState = {
      phase: 'pictionary-postgame';
      players: Array<{ id: string; handle: string; score: number }>;
      turns: Array<{
        drawerHandle: string;
        word: string;
        drawOps: DrawOp[];
        guessers: Array<{ handle: string; timeMs: number }>;
      }>;
    };

Pictionary server state:

    type PictionaryWaitingState = {
      phase: 'pictionary-waiting';
      players: Map<PlayerId, PlayerInfo>;
      nextPlayerId: number;
    };
    type PictionaryActiveState = {
      phase: 'pictionary-active';
      players: Map<PlayerId, PlayerInfo>;
      order: PlayerId[];
      currentTurnIndex: number;
      word: string;
      scores: Map<PlayerId, number>;
      turnDeadline: number;
      turnStartTime: number;
      correctGuessers: PlayerId[];
      currentTurnOps: DrawOp[];       // accumulated draw ops for current turn
      completedTurns: TurnRecord[];
    };
    type PictionaryPostgameState = {
      phase: 'pictionary-postgame';
      players: Map<PlayerId, PlayerInfo>;
      scores: Map<PlayerId, number>;
      turns: TurnRecord[];
    };
    type TurnRecord = {
      drawerId: PlayerId;
      word: string;
      drawOps: DrawOp[];
      correctGuessers: Array<{ playerId: PlayerId; timeMs: number }>;
    };

### Pictionary game rules

- Players take turns as drawer (shuffled order, each draws once).
- A random word is shown only to the drawer.
- Drawer's pen strokes stream in real-time to all guessers via relay.
- Guessers type text guesses; server checks against the word.
- Scoring: drawer gets 1 point per correct guesser; guessers get
  time-scaled points (max 10, scaled by remaining time).
- 75-second turn timer. Turn ends on timer or all guessers correct.
- The server records all DrawOps during the turn. At turn end, the
  accumulated op log is saved into the TurnRecord for postgame.
- If drawer disconnects mid-turn, the op log contains whatever was
  drawn up to that point (may be partial or empty).
- After all players have drawn, postgame shows scores and turn
  summaries. Each turn's drawing is replayed from its op log on the
  client.

### Drawing recording and postgame display

The server MUST record each turn's drawing so it can display all
drawings to all players at the end of the game. During gameplay, the
server MUST stream first-class draw ops (DrawOp) to all players in
real time — sending bitmaps on every mouse move would not be
performant enough. The question is how the drawings are stored for
postgame.

Two strategies:

(a) **First-class recording**: The server accumulates DrawOp events
    into a log (e.g. `drawOps: DrawOp[]` on the active turn). At
    postgame, the server sends these op sequences to all clients, and
    each client renders them to canvas for display. This avoids any
    server-side bitmap rendering but requires the client to replay
    potentially long op sequences.

(b) **Server-side bitmap bouncing**: The server eagerly converts
    DrawOp streams into bitmap representations (e.g. using an
    OffscreenCanvas or node-canvas). At postgame, the server sends
    the final bitmaps (as data URLs) to all clients. This is simpler
    for the client at postgame time but requires a bitmap rendering
    capability on the server.

**Chosen approach: (a) first-class recording.** The server logs every
DrawOp into the current turn's state. At postgame the full op log is
sent to clients, which replay the ops onto a canvas to produce the
drawing. This avoids a server-side canvas dependency and reuses the
existing client-side rendering code.

### Real-time stroke streaming

Draw events flow: Drawer → `ClientMessage` → Server → Server records
op into turn log → Server relays op via `RelayPayload` → all other
players.

The server stores every DrawOp in the current turn's op log
(`currentTurnOps: DrawOp[]`) as it relays them. This log is
transferred into the TurnRecord when the turn ends, and sent to all
clients at postgame for replay.

The LiveCanvas component on guessers accumulates strokes locally for
undo/clear replay. Fill operations are relayed as DrawFillOp and
replayed on the guesser canvas using the same flood-fill algorithm.

### File structure

    server/
      index.ts
      server.ts
      types.ts
      protocol.ts
      games/
        epyc/
          types.ts
          state.ts
          client-state.ts
        pictionary/
          types.ts
          state.ts
          client-state.ts
          words.ts
      __tests__/
        epyc-state.test.ts
        server.test.ts
        pictionary-state.test.ts
    client/src/
      App.tsx
      hooks/useSocket.ts
      types.ts
      components/
        JoinDialog.tsx
        WaitingRoom.tsx
        Modal.tsx
        DrawingCanvas.tsx
        epyc/
          GameBoard.tsx
          PostGame.tsx
          TextInput.tsx
          PreviousMove.tsx
        pictionary/
          PictionaryBoard.tsx
          DrawerView.tsx
          GuesserView.tsx
          LiveCanvas.tsx
          PictionaryPostGame.tsx
      styles/main.css

### Steps

[x] Step 11: Restructure EPYC into games/epyc/

    Move EPYC types to server/games/epyc/types.ts with prefixed phase
    names (epyc-waiting, epyc-underway, epyc-postgame). Move EPYC
    state functions to server/games/epyc/state.ts (self-contained:
    lobby + gameplay). Move client projections to
    server/games/epyc/client-state.ts. Update server/types.ts with
    shared types and ServerState union. Update server/protocol.ts for
    prefixed phase names. Update server/server.ts to dispatch by
    state.phase and accept gameType parameter. Update server/index.ts
    to parse --game flag. Move tests to __tests__/epyc-state.test.ts.
    Move client EPYC components into components/epyc/. Update App.tsx.

    Verify: vitest run passes, EPYC game works end-to-end.

[ ] Step 12: Add relay infrastructure

    Add RelayPayload type and { type: 'relay', payload: RelayPayload }
    to ServerMessage. Add broadcast flag to HandleResult. Update
    server.ts with relay forwarding logic: when a handler returns
    relay messages, send { type: 'relay', payload } to specified
    client PlayerId sets. Update useSocket.ts: handle relay messages,
    expose onRelay callback registration for components to subscribe.

    Verify: EPYC still works, relay infrastructure compiles and is
    ready for Pictionary.

[ ] Step 13: Add streaming mode to DrawingCanvas

    Add mode prop: 'submit' (existing EPYC behavior) or 'stream'
    (Pictionary). In stream mode: on pointerDown emit onDrawStart
    with color, size, x, y. During drag, batch points every ~50ms
    and emit onDrawMove with point array. On pointerUp emit
    onDrawEnd. For fill tool emit onFill with x, y, color. For undo
    and clear emit onUndo and onClear. Hide Submit button in stream
    mode. Submit mode is unchanged.

    Verify: EPYC drawing works as before. Debug route /debug/draw
    confirms stream callbacks fire correctly.

[ ] Step 14: Implement Pictionary server

    Create server/games/pictionary/types.ts with
    PictionaryWaitingState, PictionaryActiveState,
    PictionaryPostgameState, TurnRecord. Create state.ts with pure
    functions: createInitialState, addPlayer, removePlayer, setReady,
    checkAllReady, getCurrentDrawer, recordDrawOp (appends a DrawOp
    to currentTurnOps), submitGuess, checkTurnComplete,
    advanceTurn (finalizes currentTurnOps into TurnRecord.drawOps),
    handleDisconnect, resetGame.
    Create words.ts with ~200 common Pictionary words and pickWord().
    Create client-state.ts with getClientState projections. Add
    Pictionary phases to ServerState union and ClientGameState union.
    Wire into server.ts dispatch for pictionary-* phases. Write unit
    tests in __tests__/pictionary-state.test.ts.

    Verify: vitest run passes all tests. Can join and start a
    Pictionary game via WebSocket.

[ ] Step 15: Implement Pictionary client

    Create PictionaryBoard.tsx: routes to DrawerView or GuesserView
    based on state.role. DrawerView.tsx: shows secret word,
    DrawingCanvas in stream mode (sends draw ops as ClientMessage),
    timer, list of correct guessers. GuesserView.tsx: LiveCanvas
    rendering incoming DrawOp relays, text input for guesses, feed
    showing guess attempts, timer. LiveCanvas.tsx: read-only canvas
    that accumulates strokes from relay messages, handles undo (pop
    last stroke and redraw) and clear (reset) from its local stroke
    history. Flood fills are replayed using the same algorithm.
    PictionaryPostGame.tsx: final scores sorted by points, turn cards
    showing word + drawing replayed from DrawOp log (reuse
    LiveCanvas or a similar replay component to render the op
    sequence onto a canvas) + who guessed. Add Pictionary CSS to
    main.css. Wire into App.tsx routing by phase.

    Verify: full end-to-end Pictionary across multiple browser tabs.
