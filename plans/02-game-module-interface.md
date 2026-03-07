# Plan 02: Extract Game Module Type

**Depends on:** Plan 01 (Introduce ReduceResult pattern for both games)

## Motivation

`server.ts` currently knows about every game's message types, phases, and state
functions. Adding a third game means adding more conditional branches throughout.
A `GameModule` type would let `server.ts` be game-agnostic: it handles common
concerns (join, disconnect, connection management) and delegates game-specific
logic to a module looked up by game type.

## Design

The key constraint is avoiding `any`/`unknown`. A naive `GameModule<S>` requires
`GameModule<any>` in the registry, which we don't want.

Instead, we avoid generics entirely. Each game's reducer functions accept
`ServerState` (the discriminated union) and narrow internally via the `phase`
discriminant. `ReduceResult` also uses `ServerState` directly. This works
because the phase discriminant already tells us which game's state we have —
TypeScript narrows it naturally.

```ts
// server/game-module.ts

type GameModule = {
  createInitialState: () => ServerState;
  addPlayer: (state: ServerState, handle: string) => { state: ServerState; playerId: PlayerId };
  getClientState: (state: ServerState, playerId: PlayerId) => ClientGameState;

  reduce: (state: ServerState, playerId: PlayerId, msg: ClientMessage) => ReduceResult;
  reduceDisconnect: (state: ServerState, playerId: PlayerId) => ReduceResult;
  reduceTimer: (state: ServerState) => ReduceResult;
};
```

Internally, each game's implementation narrows the state immediately:
```ts
function epycReduce(state: ServerState, playerId: PlayerId, msg: ClientMessage): ReduceResult {
  if (state.phase !== 'epyc-waiting' && state.phase !== 'epyc-underway' && state.phase !== 'epyc-postgame') {
    return { state, effects: [] };
  }
  // state is now narrowed to EpycState — all existing helpers work
  ...
}
```

Notes:
- No generics, no `any`, no `unknown`, no casts.
- Uses `type` not `interface` per project style.
- `reduce` receives all message types. The module ignores irrelevant ones
  (returns `{ state, effects: [] }`).
- Player management (`addPlayer`) stays separate because `server.ts` needs to
  coordinate with the connection map (`Map<WebSocket, PlayerId>`).
- `getClientState` is part of the module because each game has its own
  per-player projection logic.

## Steps

- [ ] **1. Define `GameModule` type.** Create `server/game-module.ts` with the
  type above. Import it from both game modules.

- [ ] **2. Make EPYC conform.** In `server/games/epyc/state.ts`, export an
  `epycModule: GameModule` object. The reducer functions accept `ServerState`,
  narrow to `EpycState` via phase check, then delegate to existing helpers.

- [ ] **3. Make Pictionary conform.** Same for
  `server/games/pictionary/state.ts` — export `pictionaryModule: GameModule`.

- [ ] **4. Create a game registry.** In `server/game-module.ts` or a new
  `server/games/index.ts`:
  ```ts
  const gameModules: Record<GameType, GameModule> = {
    epyc: epycModule,
    pictionary: pictionaryModule,
  };
  ```

- [ ] **5. Refactor `server.ts`.** Replace the phase-based switch/if chains
  with:
  ```ts
  const gameModule = gameModules[gameType];
  // on message:
  const result = gameModule.reduce(state, playerId, msg);
  applyResult(result);
  // on disconnect:
  const result = gameModule.reduceDisconnect(state, playerId);
  applyResult(result);
  // on timer:
  const result = gameModule.reduceTimer(state);
  applyResult(result);
  ```
  Common logic (join, connection tracking) stays in `server.ts`.

- [ ] **6. Handle `ready`/`unready`/`reset` uniformly.** These are common
  across games but have game-specific effects (e.g. `checkAllReady` triggers
  different start logic). Two options:
  - **(a)** Route them through `gameModule.handle` — each game handles them.
  - **(b)** Keep common ready/reset logic in `server.ts` with game-specific
    hooks (`onAllReady`, `onReset`).
  Decision: **(a)** is simpler and keeps `server.ts` thinner. Route them through
  `gameModule.reduce`. The slight duplication of ready-toggle logic between
  games is acceptable (it's ~5 lines).

- [ ] **7. Type-check and test.** Full `tsc --noEmit` + `vitest run`.

## Risks

- The `ClientMessage` union includes messages from all games. Each game's
  `reduce` will need to narrow the message type or ignore irrelevant types. This
  is fine — a `switch` with a `default: return { state, effects: [] }`
  handles it cleanly.
- Each game's reducers accept `ServerState` and must narrow internally. This
  adds a few lines of phase-checking boilerplate at the top of each reducer, but
  it avoids generics and `any` entirely. The discriminated union makes this
  type-safe.

## Future

Once this is in place, adding a new game means:
1. Create `server/games/newgame/` with state + types + client-state
2. Export a `GameModule`
3. Add it to the registry
4. Add client components
No changes to `server.ts` needed.
