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
  | { kind: 'pointer-move'; clientX: number; clientY: number }
  | { kind: 'pointer-up'; clientX: number; clientY: number };

// --- Context: read-only info from the render ---

export type InteractionContext = {
  rendered: RenderedObject[];
};

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
      if (state.selection.has(event.objectId)) {
        // Clicked on a selected card: drag the entire selection.
        dragIds = Array.from(state.selection);
        newSelection = state.selection;
      } else {
        // Clicked on an unselected card: select just this card, drag it.
        dragIds = [event.objectId];
        newSelection = new Set([event.objectId]);
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
        },
      };
    }

    case 'pointer-move': {
      if (state.interaction.kind !== 'drag') return state;
      return {
        ...state,
        interaction: {
          ...state.interaction,
          dx: event.clientX - state.interaction.startClient.x,
          dy: event.clientY - state.interaction.startClient.y,
        },
      };
    }

    case 'pointer-up': {
      if (state.interaction.kind !== 'drag') return state;
      // The actual drop (sending messages, computing pending centers) is
      // handled by the caller — we just transition back to idle.
      return {
        ...state,
        interaction: { kind: 'idle' },
      };
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
