# Selection & Multi-Select

## Overview

Selection is **entirely client-local** — no server messages, no visibility
to other players. It determines which objects are the target of "verbs"
like forming a deck, deleting, flipping, etc.

## Interaction rules

1. **Click on an unselected card** → select just that card (clears any
   prior selection).
2. **Shift-click on a card** → toggle that card's membership in the
   selection (other selections preserved).
3. **Drag starting from empty space** → draw a selection marquee
   rectangle. On release, select all cards whose screen-space AABBs
   intersect the marquee. (Clears prior selection.)
4. **Shift-drag from empty space** → same marquee, but *add* to the
   existing selection instead of replacing it.
5. **Drag starting from a selected card** → multi-drag: all selected
   cards move together (same screen-space delta). On drop, each card
   gets its own `bwc-move-object` with the best-fit surface/position.
6. **Drag starting from an unselected card** → select just that card,
   then drag it (single-card drag, same as today).

## Visual

- Selected cards get a **light green outline** (CSS `outline` or
  `box-shadow`) rendered by the `ObjectView` component based on a
  `selected` prop.

## Architecture changes

Currently each `ObjectView` manages its own drag state internally.
This must change: the parent `BwcPlayArea` needs to coordinate
multi-card drags and marquee selection. The new design:

### Interaction state (in `BwcPlayArea`)

```ts
type Interaction =
  | { kind: 'idle' }
  | { kind: 'marquee'; startInScreen: Point; endInScreen: Point; shift: boolean }
  | { kind: 'drag';
      objectIds: string[];
      origins: Map<string, Point>;   // objectId → screen center at drag start
      fromSurfaces: Map<string, SurfaceId>;
      startClient: Point;            // clientX/Y at pointer down
      dx: number; dy: number;        // current offset
    };
```

Plus: `selection: Set<string>` (object IDs).

### Pointer event flow

All pointer events are handled on the **container div**, not on
individual object elements. Object elements still get `onPointerDown`
to identify *which* object was clicked, but they call up to the parent
immediately.

- **pointerdown on object**: set interaction to `drag` (see rules 1, 5, 6
  above for how selection is adjusted first).
- **pointerdown on empty space**: set interaction to `marquee`.
- **pointermove**: update `dx/dy` (drag) or `endInScreen` (marquee).
- **pointerup (drag)**: for each dragged object, compute best-fit drop
  via `fitCardInBounds` and send `bwc-move-object`. Set pending centers
  to avoid the flash. Clear interaction.
- **pointerup (marquee)**: compute AABB of marquee rect, intersect with
  all objects' screen AABBs, update selection. Clear interaction.

### Rendering during interaction

- **Drag**: each dragged object's screen center is offset by `(dx, dy)`.
  Non-dragged objects render normally.
- **Marquee**: a semi-transparent green rectangle is drawn between
  `startInScreen` and `endInScreen`.

### Pending drop state

To avoid the "flash to old position" on drop, store a
`pendingCenters: Map<string, Point>` that maps objectIds to their
expected post-drop screen centers. Clear each entry when the server
position changes (same `useEffect` pattern as before, but lifted to
the parent).

### Performance

Pointer-move during drag/marquee will cause the parent to re-render.
With <100 objects this should be fine. If it becomes an issue, the
dragged objects can be isolated into a wrapper div that moves via a
single CSS `transform: translate(dx, dy)` without re-rendering
individual cards.

### ObjectView becomes presentational

`ObjectView` no longer manages drag state. Its props:

```ts
type ObjectViewProps = {
  ro: RenderedObject;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, ro: RenderedObject) => void;
  onDoubleClick: (ro: RenderedObject) => void;
  onContextMenu: (e: React.MouseEvent, ro: RenderedObject) => void;
  onPointerEnter: (ro: RenderedObject) => void;
  onPointerLeave: (ro: RenderedObject) => void;
};
```

### Verbs that use selection

- **Form Deck**: toolbar button uses the current selection (must be ≥2
  cards on the same surface) instead of "all table cards".
- **Delete** (right-click or key): deletes all selected objects.
- **Flip** (double-click or key): flips all selected objects.
- **Rotate** (R key): rotates all selected objects.

## Implementation steps

- [x] **A. Refactor ObjectView** to be presentational. Move pointer
      handlers to the parent. Add `selected` prop with green outline CSS.
- [x] **B. Implement selection state + click/shift-click** in
      `BwcPlayArea`.
- [x] **C. Implement marquee selection** (drag from empty space).
- [ ] **D. Implement multi-drag** (drag from selected card moves all
      selected cards). Include pending-center logic.
- [ ] **E. Update verbs** (form deck, delete, flip, rotate) to operate
      on the full selection.
