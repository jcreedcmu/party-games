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

## Result

```
server/draw-ops.ts     — DrawOp types (shared drawing primitives)
server/protocol.ts     — Wire-level message types (ClientMessage, ServerMessage,
                         RelayPayload) + ClientGameState union
client/src/types.ts    — Barrel re-export for client; imports from protocol.ts,
                         draw-ops.ts, game-specific client-state files, and types.ts
```

Per-game client state types stay in `server/games/<game>/client-state.ts`
(where they were already defined). The client barrel (`client/src/types.ts`)
imports them directly from game folders instead of through protocol.ts.

## Steps

- [x] **1. Inventory all exports of `protocol.ts`.** Categorized as: message,
  draw-op, client-state, or other.

- [x] **2. Extract draw-op types.** Moved `DrawOp`, `DrawStartOp`, `DrawMoveOp`,
  etc. into `server/draw-ops.ts`. Protocol.ts re-exports them for backward
  compatibility with server-side imports.

- [x] **3. Remove client state re-exports from protocol.ts.** Per-game client
  state types are already defined in game folders. Removed the re-exports from
  protocol.ts.

- [x] **4. Update `client/src/types.ts`.** Now imports from three sources:
  - `../../server/protocol.js` — wire messages, DrawOp re-exports
  - `../../server/games/epyc/client-state.js` — EPYC client state types
  - `../../server/games/pictionary/client-state.js` — Pictionary client state types
  - `../../server/types.js` — MoveType, GameType

- [x] **5. Type-check and test.** All passing.

## Risks

- Many import sites to update. Mitigated by keeping DrawOp re-exports in
  protocol.ts so server-side imports don't change.
- Low behavioral risk — purely structural.
