import { describe, test, expect } from 'vitest';
import {
  reduceInteraction,
  getDisplayCenter,
  getMarqueeRect,
  initialInteractionState,
  type InteractionState,
  type InteractionContext,
} from '../interaction';
import type { RenderedObject } from '../BwcPlayArea';
import type { Point } from '../../../../../util/types';

// --- Helpers ---

function makeRo(id: string, center: Point = { x: 100, y: 100 }): RenderedObject {
  return {
    obj: {
      kind: 'card',
      id,
      pose: { x: center.x - 50, y: center.y - 70, rot: 0 },
      z: 1,
      faceUp: true,
    },
    surface: { kind: 'table' },
    rectInScreen: {
      center,
      halfSize: { x: 50, y: 70 },
      rotDeg: 0,
    },
  };
}

function ctx(...ros: RenderedObject[]): InteractionContext {
  return { rendered: ros, containerOffset: { x: 0, y: 0 } };
}

function pointerDown(objectId: string, x: number, y: number, shiftKey = false) {
  return { kind: 'object-pointer-down' as const, objectId, shiftKey, clientX: x, clientY: y };
}

function spaceDown(x: number, y: number, shiftKey = false) {
  return { kind: 'space-pointer-down' as const, shiftKey, clientX: x, clientY: y };
}

function pointerMove(x: number, y: number) {
  return { kind: 'pointer-move' as const, clientX: x, clientY: y };
}

function pointerUp(x: number, y: number) {
  return { kind: 'pointer-up' as const, clientX: x, clientY: y };
}

// --- Tests ---

describe('selection', () => {
  const cardA = makeRo('a', { x: 100, y: 100 });
  const cardB = makeRo('b', { x: 300, y: 100 });
  const c = ctx(cardA, cardB);

  test('clicking an unselected card selects just that card', () => {
    const s0 = initialInteractionState();
    const s1 = reduceInteraction(s0, pointerDown('a', 100, 100), c);
    expect(s1.selection).toEqual(new Set(['a']));
  });

  test('clicking an unselected card clears previous selection', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['b']),
    };
    const s1 = reduceInteraction(s0, pointerDown('a', 100, 100), c);
    expect(s1.selection).toEqual(new Set(['a']));
    expect(s1.selection.has('b')).toBe(false);
  });

  test('clicking a selected card keeps the full selection', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['a', 'b']),
    };
    const s1 = reduceInteraction(s0, pointerDown('a', 100, 100), c);
    expect(s1.selection).toEqual(new Set(['a', 'b']));
  });

  test('shift-clicking adds to selection', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['a']),
    };
    const s1 = reduceInteraction(s0, pointerDown('b', 300, 100, true), c);
    expect(s1.selection).toEqual(new Set(['a', 'b']));
  });

  test('shift-clicking a selected card removes it from selection', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['a', 'b']),
    };
    const s1 = reduceInteraction(s0, pointerDown('a', 100, 100, true), c);
    expect(s1.selection).toEqual(new Set(['b']));
  });

  test('shift-click does not start a drag', () => {
    const s0 = initialInteractionState();
    const s1 = reduceInteraction(s0, pointerDown('a', 100, 100, true), c);
    expect(s1.interaction.kind).toBe('idle');
  });
});

describe('drag', () => {
  const cardA = makeRo('a', { x: 100, y: 100 });
  const cardB = makeRo('b', { x: 300, y: 100 });
  const c = ctx(cardA, cardB);

  test('clicking an unselected card starts a single-card drag', () => {
    const s0 = initialInteractionState();
    const s1 = reduceInteraction(s0, pointerDown('a', 50, 50), c);
    expect(s1.interaction.kind).toBe('drag');
    if (s1.interaction.kind === 'drag') {
      expect(s1.interaction.objectIds).toEqual(['a']);
      expect(s1.interaction.dx).toBe(0);
      expect(s1.interaction.dy).toBe(0);
    }
  });

  test('clicking a selected card starts a multi-card drag', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['a', 'b']),
    };
    const s1 = reduceInteraction(s0, pointerDown('a', 50, 50), c);
    expect(s1.interaction.kind).toBe('drag');
    if (s1.interaction.kind === 'drag') {
      expect(s1.interaction.objectIds.sort()).toEqual(['a', 'b']);
      expect(s1.interaction.origins.get('a')).toEqual({ x: 100, y: 100 });
      expect(s1.interaction.origins.get('b')).toEqual({ x: 300, y: 100 });
    }
  });

  test('pointer move updates drag offset', () => {
    const s0 = initialInteractionState();
    const s1 = reduceInteraction(s0, pointerDown('a', 50, 50), c);
    const s2 = reduceInteraction(s1, pointerMove(70, 80), c);
    if (s2.interaction.kind === 'drag') {
      expect(s2.interaction.dx).toBe(20);
      expect(s2.interaction.dy).toBe(30);
    }
  });

  test('pointer move is ignored when idle', () => {
    const s0 = initialInteractionState();
    const s1 = reduceInteraction(s0, pointerMove(70, 80), c);
    expect(s1.interaction.kind).toBe('idle');
  });

  test('pointer up transitions drag to idle', () => {
    const s0 = initialInteractionState();
    const s1 = reduceInteraction(s0, pointerDown('a', 50, 50), c);
    const s2 = reduceInteraction(s1, pointerUp(70, 80), c);
    expect(s2.interaction.kind).toBe('idle');
  });

  test('pointer up preserves selection', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['a', 'b']),
    };
    const s1 = reduceInteraction(s0, pointerDown('a', 50, 50), c);
    const s2 = reduceInteraction(s1, pointerUp(70, 80), c);
    expect(s2.selection).toEqual(new Set(['a', 'b']));
  });
});

describe('getDisplayCenter', () => {
  const cardA = makeRo('a', { x: 100, y: 100 });

  test('returns server position when idle with no pending', () => {
    const s = initialInteractionState();
    expect(getDisplayCenter(cardA, s)).toEqual({ x: 100, y: 100 });
  });

  test('returns drag-adjusted position during drag', () => {
    let s = initialInteractionState();
    s = reduceInteraction(s, pointerDown('a', 50, 50), ctx(cardA));
    s = reduceInteraction(s, pointerMove(70, 80), ctx(cardA));
    expect(getDisplayCenter(cardA, s)).toEqual({ x: 120, y: 130 });
  });

  test('drag takes priority over pending', () => {
    let s: InteractionState = {
      ...initialInteractionState(),
      pendingCenters: new Map([['a', { x: 999, y: 999 }]]),
    };
    s = reduceInteraction(s, pointerDown('a', 50, 50), ctx(cardA));
    s = reduceInteraction(s, pointerMove(60, 60), ctx(cardA));
    const dc = getDisplayCenter(cardA, s);
    expect(dc).toEqual({ x: 110, y: 110 });
  });

  test('pending takes priority over server position', () => {
    const s: InteractionState = {
      ...initialInteractionState(),
      pendingCenters: new Map([['a', { x: 200, y: 300 }]]),
    };
    expect(getDisplayCenter(cardA, s)).toEqual({ x: 200, y: 300 });
  });

  test('select then drag: card moves on second interaction', () => {
    // Step 1: click to select (also starts a drag with dx=0,dy=0)
    let s = initialInteractionState();
    s = reduceInteraction(s, pointerDown('a', 50, 50), ctx(cardA));
    expect(s.selection).toEqual(new Set(['a']));
    expect(s.interaction.kind).toBe('drag');

    // Step 2: pointer up (zero-distance drag)
    s = reduceInteraction(s, pointerUp(50, 50), ctx(cardA));
    expect(s.interaction.kind).toBe('idle');

    // Step 3: click again on the (now selected) card to drag it
    s = reduceInteraction(s, pointerDown('a', 50, 50), ctx(cardA));
    expect(s.interaction.kind).toBe('drag');
    if (s.interaction.kind === 'drag') {
      expect(s.interaction.objectIds).toEqual(['a']);
    }

    // Step 4: move the pointer
    s = reduceInteraction(s, pointerMove(80, 90), ctx(cardA));
    const dc = getDisplayCenter(cardA, s);
    // Origin was (100,100), delta is (30,40)
    expect(dc).toEqual({ x: 130, y: 140 });
  });
});

describe('marquee selection', () => {
  // Cards at known screen centers (containerOffset = 0,0 so client = container coords).
  const cardA = makeRo('a', { x: 100, y: 100 }); // AABB: [50,30] to [150,170]
  const cardB = makeRo('b', { x: 300, y: 100 }); // AABB: [250,30] to [350,170]
  const cardC = makeRo('c', { x: 100, y: 300 }); // AABB: [50,230] to [150,370]
  const c = ctx(cardA, cardB, cardC);

  test('click on empty space clears selection', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['a', 'b']),
    };
    // Pointer down on empty space (no shift).
    let s = reduceInteraction(s0, spaceDown(400, 400), c);
    expect(s.selection.size).toBe(0);
    expect(s.interaction.kind).toBe('marquee');
    // Pointer up immediately (zero-size marquee hits nothing).
    s = reduceInteraction(s, pointerUp(400, 400), c);
    expect(s.selection.size).toBe(0);
    expect(s.interaction.kind).toBe('idle');
  });

  test('drag marquee selects intersecting cards', () => {
    let s = initialInteractionState();
    // Drag a rectangle from (40, 20) to (160, 180) — should hit card A.
    s = reduceInteraction(s, spaceDown(40, 20), c);
    s = reduceInteraction(s, pointerMove(160, 180), c);
    expect(s.selection).toEqual(new Set(['a']));
    s = reduceInteraction(s, pointerUp(160, 180), c);
    expect(s.selection).toEqual(new Set(['a']));
    expect(s.interaction.kind).toBe('idle');
  });

  test('large marquee selects multiple cards', () => {
    let s = initialInteractionState();
    // Drag a rectangle that covers A and B but not C.
    s = reduceInteraction(s, spaceDown(0, 0), c);
    s = reduceInteraction(s, pointerMove(400, 180), c);
    expect(s.selection).toEqual(new Set(['a', 'b']));
  });

  test('shift-marquee adds to existing selection', () => {
    const s0: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['c']),
    };
    // Shift-drag over card A — should add A while keeping C.
    let s = reduceInteraction(s0, spaceDown(40, 20, true), c);
    s = reduceInteraction(s, pointerMove(160, 180), c);
    expect(s.selection).toEqual(new Set(['a', 'c']));
    s = reduceInteraction(s, pointerUp(160, 180), c);
    expect(s.selection).toEqual(new Set(['a', 'c']));
  });

  test('marquee that hits nothing results in empty selection', () => {
    let s: InteractionState = {
      ...initialInteractionState(),
      selection: new Set(['a']),
    };
    // Drag in empty area.
    s = reduceInteraction(s, spaceDown(500, 500), c);
    s = reduceInteraction(s, pointerUp(600, 600), c);
    expect(s.selection.size).toBe(0);
  });

  test('getMarqueeRect returns rect during marquee', () => {
    let s = initialInteractionState();
    s = reduceInteraction(s, spaceDown(100, 200), c);
    s = reduceInteraction(s, pointerMove(300, 50), c);
    const mr = getMarqueeRect(s, { x: 0, y: 0 });
    expect(mr).toEqual({ left: 100, top: 50, width: 200, height: 150 });
  });

  test('getMarqueeRect returns null when idle', () => {
    expect(getMarqueeRect(initialInteractionState(), { x: 0, y: 0 })).toBeNull();
  });
});
