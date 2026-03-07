# Plan 03: Split protocol.ts

## Motivation

`server/protocol.ts` is a single file containing:
- Client → Server message types (`ClientMessage` union)
- Server → Client message types (`ServerMessage` union)
- DrawOp types (shared drawing primitives)
- All `ClientGameState` projection types for both games
- Color/tool constants

These are conceptually distinct layers. Splitting makes it clearer what's
transport-level vs. game-level and reduces merge conflicts when adding games.

## Proposed Split

```
server/protocol.ts          → Wire-level message types (ClientMessage, ServerMessage)
server/draw-ops.ts          → DrawOp types, Color, ToolType, canvas constants
server/client-state.ts      → ClientGameState union + per-game projection types
```

Alternatively, the per-game client state types could live alongside each game:
```
server/games/epyc/client-state.ts      (already exists — projection functions)
server/games/pictionary/client-state.ts (already exists — projection functions)
```
...and the *types* they export could move there too, with `client-state.ts` at
the server root just re-exporting the union.

## Steps

- [ ] **1. Inventory all exports of `protocol.ts`.** List every type and
  constant, categorize as: message, draw-op, client-state, or other.

- [ ] **2. Extract draw-op types.** Move `DrawOp`, `DrawStartOp`, `DrawMoveOp`,
  etc. plus any related constants (colors, tool types, canvas dimensions) into
  `server/draw-ops.ts`. Update imports everywhere.

- [ ] **3. Extract client-state types.** Move `ClientGameState` and its
  constituent per-game types into `server/client-state.ts` (or into each game's
  `client-state.ts`). Update imports.

- [ ] **4. Update `client/src/types.ts`.** This file re-exports from
  `../../server/protocol.js`. Update it to re-export from the new locations, or
  create a barrel export in the server so the client import path doesn't change.

- [ ] **5. Type-check and test.**

## Risks

- Many import sites to update. A barrel re-export from `protocol.ts` could
  minimize churn (protocol.ts re-exports from the new files), but that defeats
  the purpose somewhat. Better to do it cleanly.
- Low behavioral risk — purely structural.

## Decision Point

Before executing, decide: should per-game client state types live in
`server/games/<game>/client-state.ts` alongside projection functions, or in a
central `server/client-state.ts`? The former is more modular; the latter is
simpler if there are cross-game types.
