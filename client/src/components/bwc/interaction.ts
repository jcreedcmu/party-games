// Pure state machine for selection and drag interaction.
// No React, no DOM — just data in, data out.

import type { Point } from '../../../../util/types';
import type { SurfaceId } from '../../types';
import type { RenderedObject } from './BwcPlayArea';

// --- State ---

export type Interaction =
  | { kind: 'idle' }
  | { kind: 'drag';
      objectIds: string[];
      origins: Map<string, Point>;
      fromSurfaces: Map<string, SurfaceId>;
      startClient: Point;
      dx: number;
      dy: number;
      // If set, pointer-up with no significant movement should select this object.
      // Null when the dragged object was already selected (so selection is unchanged).
      selectOnClick: string | null;
    }
  | { kind: 'marquee';
      startClient: Point;
      endClient: Point;
      shift: boolean;
      // Selection as it was before the marquee started (for shift-marquee).
      priorSelection: Set<string>;
    };

export type InteractionState = {
  selection: Set<string>;
  interaction: Interaction;
  pendingCenters: Map<string, Point>;
};

export function initialInteractionState(): InteractionState {
  return {
    selection: new Set(),
    interaction: { kind: 'idle' },
    pendingCenters: new Map(),
  };
}

// --- Events ---

export type InteractionEvent =
  | { kind: 'object-pointer-down'; objectId: string; shiftKey: boolean; clientX: number; clientY: number }
  | { kind: 'space-pointer-down'; shiftKey: boolean; clientX: number; clientY: number }
  | { kind: 'pointer-move'; clientX: number; clientY: number }
  | { kind: 'pointer-up'; clientX: number; clientY: number };

// --- Context: read-only info from the render ---

export type InteractionContext = {
  rendered: RenderedObject[];
  // The container's bounding rect origin, so we can convert clientX/Y
  // to container-local coords for marquee rendering and intersection tests.
  containerOffset: Point;
};

// --- AABB intersection ---

type AABB = { minX: number; minY: number; maxX: number; maxY: number };

function aabbOfRendered(ro: RenderedObject): AABB {
  const { center, halfSize, scale, rotDeg } = ro.rectInScreen;
  // For 90/270° rotations, width and height swap.
  const r = ((rotDeg % 360) + 360) % 360;
  const hw = ((r === 90 || r === 270) ? halfSize.y : halfSize.x) * scale;
  const hh = ((r === 90 || r === 270) ? halfSize.x : halfSize.y) * scale;
  return {
    minX: center.x - hw,
    minY: center.y - hh,
    maxX: center.x + hw,
    maxY: center.y + hh,
  };
}

function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX
    && a.minY <= b.maxY && a.maxY >= b.minY;
}

function marqueeAABB(start: Point, end: Point, containerOffset: Point): AABB {
  // Convert from client coords to container-local coords.
  const x1 = start.x - containerOffset.x;
  const y1 = start.y - containerOffset.y;
  const x2 = end.x - containerOffset.x;
  const y2 = end.y - containerOffset.y;
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

function computeMarqueeSelection(
  start: Point,
  end: Point,
  shift: boolean,
  priorSelection: Set<string>,
  ctx: InteractionContext,
): Set<string> {
  const mAABB = marqueeAABB(start, end, ctx.containerOffset);
  const hit = new Set<string>();
  for (const ro of ctx.rendered) {
    if (aabbIntersects(mAABB, aabbOfRendered(ro))) {
      hit.add(ro.obj.id);
    }
  }
  if (shift) {
    // Add to prior selection.
    const result = new Set(priorSelection);
    for (const id of hit) result.add(id);
    return result;
  }
  return hit;
}

// --- Reducer ---

export function reduceInteraction(
  state: InteractionState,
  event: InteractionEvent,
  ctx: InteractionContext,
): InteractionState {
  switch (event.kind) {
    case 'object-pointer-down': {
      if (event.shiftKey) {
        // Shift-click: toggle selection, no drag.
        const next = new Set(state.selection);
        if (next.has(event.objectId)) {
          next.delete(event.objectId);
        } else {
          next.add(event.objectId);
        }
        return { ...state, selection: next };
      }

      // Determine which objects to drag.
      let dragIds: string[];
      let newSelection: Set<string>;
      let selectOnClick: string | null;
      if (state.selection.has(event.objectId)) {
        // Clicked on a selected card: drag the entire selection.
        dragIds = Array.from(state.selection);
        newSelection = state.selection;
        selectOnClick = null;
      } else {
        // Clicked on an unselected card: clear selection, drag it,
        // and defer selecting it to pointer-up (only on click, not drag).
        dragIds = [event.objectId];
        newSelection = new Set();
        selectOnClick = event.objectId;
      }

      const origins = new Map<string, Point>();
      const fromSurfaces = new Map<string, SurfaceId>();
      for (const id of dragIds) {
        const ro = ctx.rendered.find(r => r.obj.id === id);
        if (ro) {
          origins.set(id, ro.rectInScreen.center);
          fromSurfaces.set(id, ro.surface);
        }
      }

      return {
        ...state,
        selection: newSelection,
        interaction: {
          kind: 'drag',
          objectIds: dragIds,
          origins,
          fromSurfaces,
          startClient: { x: event.clientX, y: event.clientY },
          dx: 0,
          dy: 0,
          selectOnClick,
        },
      };
    }

    case 'space-pointer-down': {
      return {
        ...state,
        // If not shift, clear selection immediately (will be replaced on up).
        selection: event.shiftKey ? state.selection : new Set(),
        interaction: {
          kind: 'marquee',
          startClient: { x: event.clientX, y: event.clientY },
          endClient: { x: event.clientX, y: event.clientY },
          shift: event.shiftKey,
          priorSelection: event.shiftKey ? state.selection : new Set(),
        },
      };
    }

    case 'pointer-move': {
      if (state.interaction.kind === 'drag') {
        return {
          ...state,
          interaction: {
            ...state.interaction,
            dx: event.clientX - state.interaction.startClient.x,
            dy: event.clientY - state.interaction.startClient.y,
          },
        };
      }
      if (state.interaction.kind === 'marquee') {
        const newInteraction = {
          ...state.interaction,
          endClient: { x: event.clientX, y: event.clientY },
        };
        // Live-update selection during marquee drag.
        const newSelection = computeMarqueeSelection(
          state.interaction.startClient,
          { x: event.clientX, y: event.clientY },
          state.interaction.shift,
          state.interaction.priorSelection,
          ctx,
        );
        return {
          ...state,
          selection: newSelection,
          interaction: newInteraction,
        };
      }
      return state;
    }

    case 'pointer-up': {
      if (state.interaction.kind === 'drag') {
        const { dx, dy, selectOnClick } = state.interaction;
        const wasDragged = dx * dx + dy * dy > 4;  // > 2px movement threshold
        const newSelection = (!wasDragged && selectOnClick !== null)
          ? new Set([selectOnClick])
          : state.selection;
        return { ...state, selection: newSelection, interaction: { kind: 'idle' } };
      }
      if (state.interaction.kind === 'marquee') {
        // Final selection from the marquee.
        const finalSelection = computeMarqueeSelection(
          state.interaction.startClient,
          { x: event.clientX, y: event.clientY },
          state.interaction.shift,
          state.interaction.priorSelection,
          ctx,
        );
        return {
          ...state,
          selection: finalSelection,
          interaction: { kind: 'idle' },
        };
      }
      return state;
    }
  }
}

// --- Display center computation ---

export function getDisplayCenter(
  ro: RenderedObject,
  state: InteractionState,
): Point {
  // Active drag takes priority.
  if (state.interaction.kind === 'drag' && state.interaction.origins.has(ro.obj.id)) {
    const origin = state.interaction.origins.get(ro.obj.id)!;
    return {
      x: origin.x + state.interaction.dx,
      y: origin.y + state.interaction.dy,
    };
  }
  // Pending (waiting for server confirmation).
  const pending = state.pendingCenters.get(ro.obj.id);
  if (pending) return pending;
  // Default: server position.
  return ro.rectInScreen.center;
}

// --- Marquee rect in container-local coords (for rendering) ---

export function getMarqueeRect(
  state: InteractionState,
  containerOffset: Point,
): { left: number; top: number; width: number; height: number } | null {
  if (state.interaction.kind !== 'marquee') return null;
  const x1 = state.interaction.startClient.x - containerOffset.x;
  const y1 = state.interaction.startClient.y - containerOffset.y;
  const x2 = state.interaction.endClient.x - containerOffset.x;
  const y2 = state.interaction.endClient.y - containerOffset.y;
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
