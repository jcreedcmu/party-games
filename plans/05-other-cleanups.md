# Plan 05: Other Cleanup Opportunities

Smaller refactors that don't warrant their own full plan but are worth tracking.

## A. Timer Service Extraction

**Problem:** Timer logic (`setTimeout`, `clearTimeout`, deadline calculation)
is scattered through `server.ts` and entangled with game state transitions.

**Fix:** After Plan 01, timer scheduling is driven by `set-timer` / `clear-timer`
effects interpreted by `applyResult`. This item is mostly addressed by Plan 01.
The remaining work is verifying no inline `setTimeout` calls survive.

**Benefit:** Testability (inject a fake timer), and P2P compatibility (replace
Node `setTimeout` with browser equivalent).

- [ ] Audit remaining inline timer usage in `server.ts` after Plan 01
- [ ] Extract to a single `applyTimer` helper if needed

## B. Client-Side Game Router

**Problem:** `App.tsx` has a growing switch on `gameState.phase` that will get
longer with each game.

**Fix:** Create a game component registry:
```ts
type GameRouter = Record<string, (props: GameProps) => React.ReactNode>;
// or more specifically, a function from phase prefix to component
```

Each game exports its own phase-to-component mapping. `App.tsx` looks up the
component by phase prefix (`epyc-`, `pictionary-`) and renders it.

- [ ] Define a `GameComponentMap` type
- [ ] Have each game's component directory export a mapping
- [ ] Simplify `App.tsx` to use the registry

## C. Shared Test Utilities

**Problem:** Both `server.test.ts` and game-specific state tests have their own
helpers for creating players, advancing state, etc.

**Fix:** Create `server/__tests__/test-utils.ts` with shared helpers like
`createTestPlayers(n)`, `makeConnectedState(gameType, playerCount)`, etc.

- [ ] Inventory duplicate helpers across test files
- [ ] Extract shared helpers to `test-utils.ts`
- [ ] Update test files to import from shared module

## D. Message Type Narrowing

**Problem:** `ClientMessage` is a flat union of all games' messages. Each game's
`reduce` function receives the full union and must ignore irrelevant types.

**Fix:** Split `ClientMessage` into:
```ts
type CommonMessage = JoinMessage | ReadyMessage | UnreadyMessage | ResetMessage;
type EpycMessage = SubmitMessage;
type PictionaryMessage = GuessMessage | TurnDoneMessage | PickWordMessage;
type DrawMessage = DrawStartMessage | DrawMoveMessage | ...;

type ClientMessage = CommonMessage | EpycMessage | PictionaryMessage | DrawMessage;
```

Each game's `reduce` accepts `ClientMessage` but only matches its own subset.
The type split is mostly documentary — it helps readers understand which messages
belong to which game.

- [ ] Categorize all ClientMessage variants by game
- [ ] Group them with intermediate union types
- [ ] Update `ClientMessage` to be a union of the groups

## Execution

These are independent of each other and can be done in any order. Items A and B
benefit from Plans 01-02 being done first. Items C and D can be done anytime.
