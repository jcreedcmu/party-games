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
6. **Seated around a square table.** Players have rotational positions
   distributed along the four sides of a square. Each player's client
   renders the table rotated so their seat is at the bottom. It's likely that there
   are not more than ~10 players but there's no hard limit;
   seat distribution is computed to balance the four sides.

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
  text: string;              // description of what the card does
  creator: string;           // handle of original author
  createdAt: string;         // stringified Date
};

// A position on the table. Coordinates are in "table space" — a fixed
// logical square. Each client rotates the rendering so their seat is
// at the bottom.
type Pose = { x: number; y: number; rot: number }; // rotation is in degrees, likely to be in 0, 90, 180, 270 in practice.

// A "surface" is a 2D space containing objects. The shared table is one
// surface; each player's hand is another (private) surface. Surfaces share
// the same coordinate conventions and the same set of object kinds, so most
// operations (move, flip, bring-to-front, form-deck, etc.) work uniformly
// regardless of which surface an object lives on.
type SurfaceId =
  | { kind: 'table' }
  | { kind: 'hand'; ownerId: PlayerId };

type TableObject =
  | { kind: 'card';  id: ObjectId; cardId: CardId; pose: Pose; faceUp: boolean; z: number }
  | { kind: 'deck';  id: ObjectId; cardIds: CardId[]; pose: Pose; faceUp: boolean; z: number };

type Surface = {
  id: SurfaceId;
  objects: Map<ObjectId, TableObject>;
  zCounter: number;
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
  table: Surface;                       // shared
  hands: Map<PlayerId, Surface>;        // one private surface per player
  scores: Map<PlayerId, number>;        // first-class per-player score
};

type BwcState = BwcWaitingState | BwcPlayingState;
```

The **card library** is *not* in `BwcState` — it's a separate persisted store
(see Persistence below) that the BWC module reads from and writes to.

### Client state projection (`server/protocol.ts` additions)

```ts
type BwcVisibleObject =
  | { kind: 'card'; id: ObjectId; pose: Pose; z: number;
      // present only if face-up:
      card?: { id: CardId; ops: DrawOp[]; text: string; creator: string } }
  | { kind: 'deck'; id: ObjectId; pose: Pose; z: number; faceUp: boolean;
      count: number; topCard?: { id: CardId; ops: DrawOp[]; text: string } /* if faceUp */ };

// A surface as seen by a particular client. The shared table is always
// fully visible (modulo face-down cards). My own hand is fully visible.
// Other players' hands are summarized as a count of objects only.
type BwcVisibleSurface =
  | { id: SurfaceId; visibility: 'full'; objects: BwcVisibleObject[] }
  | { id: SurfaceId; visibility: 'opaque'; objectCount: number };

type BwcPlayingClientState = {
  phase: 'bwc-playing';
  mySeat: SeatIndex;
  seats: Array<{ playerId: PlayerId; handle: string; seat: SeatIndex; side: 'N'|'E'|'S'|'W'; score: number }>;
  table: BwcVisibleSurface;             // always 'full'
  myHand: BwcVisibleSurface;            // always 'full'
  otherHands: BwcVisibleSurface[];      // always 'opaque'
};
```

The projection function hides:
- DrawOps of face-down cards (on any surface, including the owner's own
  hand — face-down means face-down)
- The entire contents of other players' hands (only an object count is exposed)
- Deck composition below the top card

---

## Protocol

### Client → server messages (`BwcClientMessage`)

All messages are **intents** — whole gestures, not increments.

| Message | Fields | Notes |
|---|---|---|
All object-targeting messages identify an object by `(surface, objectId)`,
so the same op works whether the object lives on the shared table or in a
player's hand. Cross-surface moves are expressed as a single `move-object`
with a different destination surface — there are no separate
take-to-hand / play-from-hand messages.

Authorization: any player may freely operate on the table surface and on
their *own* hand surface. Operations on another player's hand are rejected.

| Message | Fields | Notes |
|---|---|---|
| `bwc-create-card` | `ops: DrawOp[], text: string` | Adds to library, returns new CardId |
| `bwc-edit-card` | `cardId, ops, text` | Replaces art and text |
| `bwc-spawn-card` | `cardId, surface, pose, faceUp` | Puts a library card onto a surface |
| `bwc-move-object` | `from: SurfaceId, objectId, to: SurfaceId, pose` | Single complete drag, possibly cross-surface |
| `bwc-flip-object` | `surface, objectId` | Card or deck |
| `bwc-bring-to-front` | `surface, objectId` | Updates z within that surface |
| `bwc-delete-object` | `surface, objectId` | Cards return to library limbo |
| `bwc-draw-from-deck` | `surface, deckId, to: SurfaceId, pose` | Draws top card to a destination surface |
| `bwc-return-to-deck` | `srcSurface, objectId, deckSurface, deckId, position: 'top'\|'bottom'` | |
| `bwc-shuffle-deck` | `surface, deckId` | |
| `bwc-form-deck` | `surface, objectIds[], pose` | Combines selected cards on one surface into a deck |
| `bwc-set-score` | `playerId, score` | Set absolute score for any player |
| `bwc-adjust-score` | `playerId, delta` | Increment/decrement any player's score |

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

Late joins during `bwc-playing` are not supported for *new* players.
A previously-seated player who disconnects may always reconnect and reclaim
their seat + hand (see Player identity below). Seats are never redistributed
mid-game — card positions on the table may be meaningful "in front of" a
specific seat, and shuffling seats would be impossible to reconcile cleanly.

## Player identity & reconnection

To distinguish "same player reconnecting" from "new player joining," the
client generates a stable GUID at first startup and stashes it in
`localStorage`. The GUID is sent on `join` (alongside handle/password) and
the server uses it as the durable player identity. This is new infrastructure
that doesn't exist for the other two games — Step 1 must verify the existing
reconnect path and add the GUID-based identity if missing. (The other games
can adopt it later, or not; it's not load-bearing for them.)

During `bwc-playing`, `join` is accepted only if the GUID matches a seated
player. New GUIDs are rejected with an error.

---

## Persistence

Two stores under `data/bwc/`:

### Card library (`cards.json`)

```json
{
  "cards": {
    "<cardId>": { "ops": [...], "creator": "alice", "createdAt": "2026-05-12 ..." }
  }
}
```

- Written on every `bwc-create-card` and `bwc-edit-card`.
- Loaded at server startup.
- Survives `reset`.
- Cards "discarded" or "deleted from table" return here, not deleted from
  the library. (True deletion would require manual filesystem operations out
  of the scope of the application)

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
  HandTray.tsx         — own hand at bottom of screen
  OtherHands.tsx       — opaque card-back fans at other seats
  CardEditor.tsx       — DrawingCanvas + text input; used for both create and edit
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

- [ ] **Step 6: Hand surfaces & hidden info.** Each player gets a private
      `Surface` rendered as a second canvas (the "hand tray"). Cross-surface
      moves via `bwc-move-object` (drag from table → hand or vice versa).
      Projection hides other players' hand contents (only count exposed) and
      hides face-down cards everywhere. Render `OtherHands` as opaque
      placeholders showing only the count.

- [ ] **Step 7: Decks.** Implement `bwc-form-deck`, `bwc-draw-from-deck`,
      `bwc-return-to-deck`, `bwc-shuffle-deck`, face-down deck projection.
      `DeckView` component.

- [ ] **Step 8: Scores.** First-class per-player score display near each
      seat with +/- controls. Scores are global `Map<PlayerId, number>`
      state. Any player can adjust any player's score (trust-based, like
      the rest of the tabletop).

- [ ] **Step 9: Card editing.** `bwc-edit-card` (re-open DrawingCanvas
      seeded with existing ops). Decide on history (open question below).

- [ ] **Step 10: Table snapshot persistence.** Debounced save, load on
      startup, reset clears table snapshot but not library.

- [ ] **Step 11: Polish.** Multi-select drag, visual affordances for
      face-down vs face-up, hover tooltips with card creator, "shuffle"
      animation, a "tidy hand" verb that flips every card in the owner's
      hand face-up and lays them out in a neat row, etc. As-needed.

---

## Open questions to resolve before / during implementation

1. **Card edit history.** When a card is edited, do we keep the old version?
   Versioning is more faithful to "cards persist forever" but adds storage
   complexity. Suggestion: keep a `history: DrawOp[][]` per card, never UI-
   exposed initially but available for future "undo edit" features.

Answer: No, we don't keep the old version. The `DrawOp[]` itself is a good enough
record of the sequence of operations.

2. **Deck face-down vs face-up semantics.** A face-up deck reveals the top
   card; a face-down deck reveals nothing. Does flipping a deck reverse its
   order? (Physically, yes — flipping a physical deck inverts it.) Implement
   the physical behavior.

Answer: Yes, we should support face-up *and* face-down states of decks, with
the "real-world physics" behavior that flipping a deck reversing the
order of the cards in it.

3. **Card identity when in a hand.** Are the same `CardId`s usable in two
   places at once (e.g. on the table *and* in a hand)? Default: **no.** A
   given CardId has at most one "instance" — either in the library limbo,
   on the table (as a `TableObject` of kind `card`), in a deck, or in a
   hand. The library tracks *definitions*; the table tracks *locations*.
   This means we need a `cardLocation: Map<CardId, Location>` index for
   sanity checks.

Indeed, I would say "no": tokens can be duplicated, but there is at most
one copy of any card at any time.

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

Answer: No, multiple copies of a card are not supported. This is also
to correctly simulate "real-world physics".

5. **Right place for persistence helpers.** Look at how `word-stats` is
   persisted in the existing code and follow that convention.

Answer: You can look to the code for precedent for how to manage
persistent state, but we should put persistent data for BWC in the
directory `data/bwc/`.

6. **Selection model.** Single-select first; multi-select in polish step.

Answer: Yup, we don't need multi-select in the first iteration.

7. **What happens to a player's hand if they disconnect?** Two options:
   (a) hand stays reserved indefinitely; (b) hand is dumped face-down on
   the table after a grace period. Recommendation: (a), since 1kbwc games
   are long and reconnects should be seamless. The hand is keyed by
   `PlayerId`, so reconnecting with the same handle should reclaim it
   (depends on existing reconnect semantics — verify in step 1).

Answer: (a), their hand should be preserved. Most likely
disconnections are accidental, and we should permit the same player to
reconnect seamlessly and resume play.
