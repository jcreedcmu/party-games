# 1000 Blank White Cards — Implementation Plan

A third game module for poop-deli, alongside EPYC and Pictionary. The defining
property of 1000 Blank White Cards (henceforth "1kbwc") is that *the players
invent the rules as they go*, often by writing them on the cards themselves.
The server therefore does not enforce game rules — it provides a **shared
2D tabletop** ("physics layer") in which players manipulate cards, decks,
tokens, dice, and hands. Players enforce the actual rules socially (assumed
to be over a simultaneous video call; no in-game chat is planned).

## Design decisions (locked in)

1. **Cards are stored as DrawOps**, not PNG dataUrls. Less data in transit,
   replayable, and supports later editing/undo of card art.
2. **Intent-based actions, last-write-wins.** Clients send whole gestures
   ("move card C to (x,y) rotated 90°") rather than streaming pixel-level
   drags. The server is authoritative; clients render optimistically and
   reconcile on the broadcast echo. No soft locks.
3. **Two layers of persistence:**
   - **Card library** — every card ever created persists across games. This
     is core to the "culture" of 1kbwc.
   - **Table snapshot** — periodic best-effort backup of live table state so a
     server restart mid-game is recoverable. Not a hard requirement; treat as
     a safety net.
4. **No programmed end condition.** Players declare winners socially. The
   host can `reset` to clear the table (but not the card library).
5. **No chat.**
6. **Seated around a rectangular table.** Players have rotational positions
   distributed along the four sides of a rectangle. Each player's client
   renders the table rotated so their seat is at the bottom. Soft cap ~10
   players; seat distribution is computed to balance the four sides.

## Architectural fit

1kbwc reuses the existing infrastructure:
- **Game module pattern** (`server/games/bwc/`) registered in `game-module.ts`
- **Discriminated phase union** with `bwc-` prefix
- **`getClientState(state, playerId)` projection** for hidden info (hands,
  face-down cards, deck contents)
- **Relay effects** for low-latency echoes of intents to other players
- **DrawingCanvas** in stream mode (since cards are DrawOps) for card creation
  and editing

The main *new* infrastructure is persistence (card library + table snapshot),
which neither existing game has.

---

## Data model

### Core types (`server/games/bwc/types.ts`)

```ts
type CardId = string;        // stable across games (library-wide)
type ObjectId = string;      // table-instance id
type SeatIndex = number;     // 0..N-1, assigned at join time

type Card = {
  id: CardId;
  ops: DrawOp[];             // front art
  creator: string;           // handle of original author
  createdAt: number;
};

// A position on the table. Coordinates are in "table space" — a fixed
// logical rectangle. Each client rotates the rendering so their seat is
// at the bottom.
type Pose = { x: number; y: number; rot: number };

type TableObject =
  | { kind: 'card';  id: ObjectId; cardId: CardId; pose: Pose; faceUp: boolean; z: number }
  | { kind: 'deck';  id: ObjectId; cardIds: CardId[]; pose: Pose; faceUp: boolean; z: number }
  | { kind: 'token'; id: ObjectId; color: string; label: string | null; pose: Pose; z: number }
  | { kind: 'die';   id: ObjectId; sides: number; value: number; pose: Pose; z: number };

type Hand = {
  ownerId: PlayerId;
  cardIds: CardId[];         // ordered, owner-visible only
};

type BwcWaitingState = {
  phase: 'bwc-waiting';
  players: Map<PlayerId, PlayerInfo>;
  ready: Set<PlayerId>;
};

type BwcPlayingState = {
  phase: 'bwc-playing';
  players: Map<PlayerId, PlayerInfo>;
  seats: Map<PlayerId, SeatIndex>;
  objects: Map<ObjectId, TableObject>;
  hands: Map<PlayerId, Hand>;
  zCounter: number;          // monotonically increasing for "bring to front"
};

type BwcState = BwcWaitingState | BwcPlayingState;
```

The **card library** is *not* in `BwcState` — it's a separate persisted store
(see Persistence below) that the BWC module reads from and writes to.

### Client state projection (`server/protocol.ts` additions)

```ts
type BwcClientHand =
  | { ownerId: PlayerId; mine: true; cardIds: CardId[] }
  | { ownerId: PlayerId; mine: false; count: number };

type BwcVisibleObject =
  | { kind: 'card'; id: ObjectId; pose: Pose; z: number;
      // present only if face-up:
      card?: { id: CardId; ops: DrawOp[]; creator: string } }
  | { kind: 'deck'; id: ObjectId; pose: Pose; z: number; faceUp: boolean;
      count: number; topCard?: { id: CardId; ops: DrawOp[] } /* if faceUp */ }
  | { kind: 'token'; ... }
  | { kind: 'die'; ... };

type BwcPlayingClientState = {
  phase: 'bwc-playing';
  mySeat: SeatIndex;
  seats: Array<{ playerId: PlayerId; handle: string; seat: SeatIndex; side: 'N'|'E'|'S'|'W' }>;
  objects: BwcVisibleObject[];
  hands: BwcClientHand[];
};
```

The projection function hides:
- DrawOps of face-down cards (on table or in face-down decks)
- The full content of others' hands (only count is exposed)
- Deck composition below the top card

---

## Protocol

### Client → server messages (`BwcClientMessage`)

All messages are **intents** — whole gestures, not increments.

| Message | Fields | Notes |
|---|---|---|
| `bwc-create-card` | `ops: DrawOp[]` | Adds to library, returns new CardId |
| `bwc-edit-card` | `cardId, ops` | Replaces art (history tracked? see open Q) |
| `bwc-spawn-card` | `cardId, pose, faceUp` | Puts a library card on the table |
| `bwc-move-object` | `objectId, pose` | Single complete drag |
| `bwc-flip-object` | `objectId` | Card or deck |
| `bwc-bring-to-front` | `objectId` | Updates z |
| `bwc-delete-object` | `objectId` | Removes from table (cards return to library) |
| `bwc-take-to-hand` | `objectId` | Card on table → my hand |
| `bwc-play-from-hand` | `cardId, pose, faceUp` | My hand → table |
| `bwc-discard-from-hand` | `cardId` | Hand → library limbo |
| `bwc-draw-from-deck` | `deckId, toHand: bool, pose?` | Draws top card |
| `bwc-return-to-deck` | `objectId, deckId, position: 'top'\|'bottom'` | |
| `bwc-shuffle-deck` | `deckId` | |
| `bwc-form-deck` | `objectIds[], pose` | Combines selected cards into a deck |
| `bwc-spawn-token` | `color, label?, pose` | |
| `bwc-spawn-die` | `sides, pose` | |
| `bwc-roll-die` | `dieId` | Server picks RNG; broadcasts result |
| `bwc-adjust-token` | `tokenId, delta?, label?` | Score-counter use case |

### Server → client

Reuses the existing `state` (full state) and `relay` (incremental hint)
responses. For move/flip/bring-to-front, the server applies the change to
canonical state and broadcasts a small relay payload so other clients can
animate without waiting for a full state replacement. We may not need
incremental relay at all in the first iteration — broadcasting full state
on every action is the simplest correct option, and with <10 players it's
likely fine. **Start with full-state broadcasts; add relay optimization only
if it feels laggy.**

---

## Seating

On transition `bwc-waiting → bwc-playing`, players are assigned seats. Seat
distribution algorithm (to be implemented in `seating.ts`):

- N players, distribute as evenly as possible across 4 sides (S, E, N, W).
- Prefer S to fill first (so 1-player and small-table cases sit "in front").
- Within a side, evenly space along that edge.
- Each seat has `(side, fraction)` → derived `(x, y, rotation)` in table space.

The client receives `mySeat` and rotates the entire table render so its own
seat is at the bottom. Other players' avatars/labels are drawn at their
seat positions.

Late joins during `bwc-playing` are allowed (unlike EPYC) — the joining
player is assigned the next free seat slot, which may trigger a rebalance
*only if* no rebalance happens to existing players (rebalancing live seats
would be visually jarring; better to leave gaps).

---

## Persistence

Two stores under `server/games/bwc/storage/` (or wherever fits the existing
project layout — TBD when we look at how `word-stats` is persisted, since
that's the only existing precedent in the codebase):

### Card library (`cards.json`)

```json
{
  "cards": {
    "<cardId>": { "ops": [...], "creator": "alice", "createdAt": 1234 }
  }
}
```

- Written on every `bwc-create-card` and `bwc-edit-card`.
- Loaded at server startup.
- Survives `reset`.
- Cards "discarded" or "deleted from table" return here, not deleted from
  the library. (True deletion would need an explicit admin action.)

### Table snapshot (`table.json`)

- Written periodically (debounced, e.g. every 5s when dirty) and on clean
  shutdown.
- Loaded at startup *only if* present and recent. On load, all sockets are
  disconnected anyway (server just started), so players will rejoin into
  the restored table.
- Best-effort safety net; not authoritative.

---

## Client structure

```
client/src/components/bwc/
  BwcGame.tsx          — phase router (mirrors PictionaryGame.tsx)
  BwcWaitingRoom.tsx   — reuses existing waiting room patterns
  BwcTable.tsx         — the main tabletop view (SVG or canvas)
  TableObject.tsx      — renders one TableObject (dispatch on kind)
  CardView.tsx         — renders a card (DrawOps via shared draw renderer)
  DeckView.tsx
  TokenView.tsx
  DieView.tsx
  HandTray.tsx         — own hand at bottom of screen
  OtherHands.tsx       — opaque card-back fans at other seats
  CreateCardModal.tsx  — wraps DrawingCanvas in stream mode + submit
  Toolbar.tsx          — spawn tokens/dice, new card, etc.
  seating.ts           — shared seating math (or import from server)
```

Key client concerns:
- **Coordinate transform**: a single root `<g transform="rotate(...)">` (if
  SVG) or canvas transform that rotates table space so `mySeat` is at S.
- **Optimistic intents**: on user action, immediately mutate local state and
  fire the intent message. Reconcile when server state arrives. Because all
  intents are atomic, reconciliation is just "replace local with server."
- **Drag handling**: pointerdown captures, pointermove updates a local
  ghost, pointerup sends a single `bwc-move-object` with the final pose.
  No streaming.

---

## Implementation steps

Each step ends in a working, type-checking, runnable state. Mark with `[x]`
as completed per CLAUDE.md.

- [ ] **Step 1: Skeleton & registration.** Create `server/games/bwc/` with
      empty `types.ts`, `state.ts` (waiting phase only, no objects), and
      register in `game-module.ts`. Add `'bwc'` to `GameType`. Add
      `make dev-bwc` target. Create stub `BwcGame.tsx` and route in
      `App.tsx`. Verify the lobby works end-to-end.

- [ ] **Step 2: Data model & protocol types.** Define all `TableObject`,
      `Hand`, `BwcState`, message, and client-state types. No reducer logic
      yet — type-check only.

- [ ] **Step 3: Card library persistence.** Implement load/save of
      `cards.json`. Implement `bwc-create-card` reducer + the projection of
      library cards into client state. Build minimal `CreateCardModal` using
      DrawingCanvas. End state: players can create cards and see them in a
      "library" panel, surviving server restart.

- [ ] **Step 4: Spawn & move objects.** Implement `bwc-spawn-card`,
      `bwc-move-object`, `bwc-bring-to-front`, `bwc-flip-object`,
      `bwc-delete-object`. Implement `BwcTable` with SVG rendering,
      pointer drag, and z-ordering. No rotation/seating yet — assume all
      players see the table the same way.

- [ ] **Step 5: Seating.** Implement seating algorithm, assign seats on
      `waiting → playing` transition, project `mySeat` per player, and
      apply rotation transform on the client. Add seat avatars/labels.

- [ ] **Step 6: Hands & hidden info.** Implement `Hand`, the
      take/play/discard ops, projection that hides others' hands, and
      `HandTray` + `OtherHands` components.

- [ ] **Step 7: Decks.** Implement `bwc-form-deck`, `bwc-draw-from-deck`,
      `bwc-return-to-deck`, `bwc-shuffle-deck`, face-down deck projection.
      `DeckView` component.

- [ ] **Step 8: Tokens & dice.** Spawn/adjust/roll. Toolbar additions.

- [ ] **Step 9: Card editing.** `bwc-edit-card` (re-open DrawingCanvas
      seeded with existing ops). Decide on history (open question below).

- [ ] **Step 10: Table snapshot persistence.** Debounced save, load on
      startup, reset clears table snapshot but not library.

- [ ] **Step 11: Polish.** Multi-select drag, visual affordances for
      face-down vs face-up, hover tooltips with card creator, "shuffle"
      animation, etc. As-needed.

---

## Open questions to resolve before / during implementation

1. **Card edit history.** When a card is edited, do we keep the old version?
   Versioning is more faithful to "cards persist forever" but adds storage
   complexity. Suggestion: keep a `history: DrawOp[][]` per card, never UI-
   exposed initially but available for future "undo edit" features.
2. **Deck face-down vs face-up semantics.** A face-up deck reveals the top
   card; a face-down deck reveals nothing. Does flipping a deck reverse its
   order? (Physically, yes — flipping a physical deck inverts it.) Implement
   the physical behavior.
3. **Card identity when in a hand.** Are the same `CardId`s usable in two
   places at once (e.g. on the table *and* in a hand)? Default: **no.** A
   given CardId has at most one "instance" — either in the library limbo,
   on the table (as a `TableObject` of kind `card`), in a deck, or in a
   hand. The library tracks *definitions*; the table tracks *locations*.
   This means we need a `cardLocation: Map<CardId, Location>` index for
   sanity checks.
4. **Multiple copies of a card.** Sometimes you want N copies of the same
   card design. Solution: each `TableObject`/hand entry references a
   `CardId`, but the card *definition* in the library is shareable. So
   "spawn 5 copies of card X" creates 5 table objects all referencing X.
   This contradicts (3) — we need to choose: either CardIds are unique
   per-instance (and share a `definitionId`), or table objects reference
   `CardId` and (3) is wrong. **Recommendation:** introduce
   `CardDefinitionId` (library-level) and `CardInstanceId` (location-level).
   Library stores definitions; table objects/hands hold instances; each
   instance points to a definition.
5. **Right place for persistence helpers.** Look at how `word-stats` is
   persisted in the existing code and follow that convention.
6. **Selection model.** Single-select first; multi-select in polish step.
7. **What happens to a player's hand if they disconnect?** Two options:
   (a) hand stays reserved indefinitely; (b) hand is dumped face-down on
   the table after a grace period. Recommendation: (a), since 1kbwc games
   are long and reconnects should be seamless. The hand is keyed by
   `PlayerId`, so reconnecting with the same handle should reclaim it
   (depends on existing reconnect semantics — verify in step 1).
