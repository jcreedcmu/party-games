# Plan 01: Introduce ReduceResult Pattern

## Motivation

Both EPYC and Pictionary state functions return bare state. `server.ts`
orchestrates everything inline after each mutation — calling `broadcastState()`,
`forwardRelays()`, managing timers with `startRoundTimer()`/`startTurnTimer()`,
etc. This means `server.ts` is a monolithic dispatcher that knows the details of
every game's state transitions, timer semantics, and relay patterns.

Introducing a `ReduceResult` return type lets game modules declare their
side-effects (broadcast, relay, timer) as data, and `server.ts` applies them
uniformly. This is a prerequisite for extracting a game plugin type (Plan 02).

## Current State

Both games' state functions return plain state objects. `server.ts` has ~200
lines of game-specific orchestration in `handleMessage()` and the disconnect
reducer:

- EPYC: `submitMove` → `checkRoundComplete` → maybe `startRoundTimer()` →
  `broadcastState()` (all inline in server.ts)
- Pictionary: `submitGuess` → build relay → `forwardRelays()` → maybe
  `shortenDeadline` → `startTurnTimer()` → `broadcastState()` (all inline)

## Design

The core idea is to cleanly separate pure state computation from side effects.
A reducer is a pure function: `(state, event) → (state, effects)`. The server
interprets the effects.

Define an `Effect` discriminated union and `ReduceResult` in `server/types.ts`:

```ts
type Effect =
  | { type: 'broadcast' }
  | { type: 'relay'; messages: RelayMessage[] }
  | { type: 'send'; playerId: PlayerId; msg: ServerMessage }
  | { type: 'set-timer'; deadline: number }
  | { type: 'clear-timer' };

type ReduceResult = {
  state: ServerState;
  effects: Effect[];
};
```

Effects are data describing what should happen — not the execution itself.
`server.ts` has an `applyResult` function that interprets the effect list:
walk the array, and for each effect, broadcast state / forward relays / send
targeted messages / schedule or clear timers.

This is extensible: adding a new kind of side effect (e.g. logging, persisting
to disk) is just a new arm of the `Effect` union + a case in the interpreter.

Each game exports top-level reducer functions that compose the existing helpers
and return `ReduceResult`:

```ts
// These are the signatures; the actual functions live in each game's state.ts
type ReduceFn = (state: ServerState, playerId: PlayerId, msg: ClientMessage) => ReduceResult;
type ReduceDisconnectFn = (state: ServerState, playerId: PlayerId) => ReduceResult;
type ReduceTimerFn = (state: ServerState) => ReduceResult;
```

## Steps

- [x] **1. Define `Effect` and `ReduceResult`.** Add the types to
  `server/types.ts`.

- [x] **2. Write `applyResult` in `server.ts`.** An effect interpreter that
  takes a `ReduceResult`, updates `state`, then walks `effects` and executes
  each one: `broadcast` → send per-player state views, `relay` → forward to
  target players, `send` → send to one player, `set-timer` → schedule timeout,
  `clear-timer` → cancel timeout.

- [x] **3. Add EPYC reducer functions.** In `server/games/epyc/state.ts`, add:
  - `epycReduce(state, playerId, msg)` — dispatches `submit`, `ready`,
    `unready`, `reset` by composing the existing helpers.
  - `epycReduceDisconnect(state, playerId)` — wraps `removePlayer` +
    `checkRoundComplete` + possibly `advanceRound`.
  - `epycReduceTimer(state)` — wraps the round-timeout logic.
  Each returns `ReduceResult` with appropriate effects.

- [x] **4. Add Pictionary reducer functions.** Same pattern in
  `server/games/pictionary/state.ts`:
  - `pictionaryReduce(state, playerId, msg)` — dispatches `guess`, `pick-word`,
    `turn-done`, `draw-*`, `ready`/`unready`, `add-word`.
  - `pictionaryReduceDisconnect(state, playerId)`
  - `pictionaryReduceTimer(state)`

- [x] **5. Refactor `server.ts` to use reducers + `applyResult`.** Replace the
  inline game-specific logic in `handleMessage()` and the disconnect reducer
  with calls to the game reducer functions + `applyResult()`. Both games should
  follow the same pattern.

- [x] **6. Remove dead inline orchestration.** Delete `startRoundTimer()`,
  `startTurnTimer()`, and the game-specific branches that are now handled by
  the reducer functions. Timer scheduling is now driven entirely by
  `applyResult` interpreting `set-timer` / `clear-timer` effects.

- [x] **7. Type-check and test.** Run `npx tsc --noEmit` for both server and
  client. Run `npx vitest run`. Fix any issues.

## Risks

- Low risk. The state helper functions don't change; we're just adding a
  composition layer on top.
- Timer semantics need care: make sure `set-timer` / `clear-timer` effects
  correctly replace the inline `setTimeout` / `clearTimeout` calls.
- The Pictionary draw-op relay + guess relay logic is somewhat involved
  (computing target player lists, building relay payloads). This logic moves
  from `server.ts` into `pictionaryReduce`, which is the right place for it
  since it's game-specific.
