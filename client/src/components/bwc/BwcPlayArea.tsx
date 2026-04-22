import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type {
  BwcVisibleObject, BwcVisibleSurface, BwcClientSeat, BwcClientCardFull,
  ClientMessage, Pose, Side, SurfaceId, CardId, DrawOp,
} from '../../types';
import { CardView, CardBack, CardFaceBlank } from './CardView';
import { PieMenu, type PieMenuItem } from './PieMenu';
import { SE2, apply, composen, inverse, mkTranslate, mkScale, mkRotate, type Rot } from '../../../../util/se2';
import type { Point } from '../../../../util/types';
import { transformRect, orientedRectToStyle, type OrientedRect } from '../../../../util/oriented-rect';
import {
  reduceInteraction,
  getDisplayCenter,
  getMarqueeRect,
  initialInteractionState,
  type InteractionState,
  type Interaction,
} from './interaction';

import { TABLE_LOGICAL, HAND_LOGICAL_W, HAND_LOGICAL_H, CARD_W, CARD_H } from '../../../../server/games/bwc/constants';

// To bring a player's edge to the bottom of the screen, we need:
// S=0 (already at bottom), N=2 (180°), E=3 (270° CW = 90° CCW), W=1 (90° CW)
const SIDE_TO_ROT: Record<Side, Rot> = { S: 0, N: 2, E: 3, W: 1 };

// Build the SE2 that maps table-logical coords → screen coords.
function buildScreenOfTable(scale: number, seatRot: Rot): SE2 {
  const half = TABLE_LOGICAL / 2;
  return composen(
    mkScale(scale),
    mkTranslate({ x: half, y: half }),
    mkRotate(seatRot),
    mkTranslate({ x: -half, y: -half }),
  );
}

// Build the SE2 that maps hand-logical coords → screen coords.
function buildScreenOfHand(scale: number, tableScreenH: number): SE2 {
  return composen(
    mkTranslate({ x: 0, y: tableScreenH }),
    mkScale(scale),
  );
}

// Given a desired card center in a surface's logical space, find the
// nearest center that keeps the entire card within [0, W] × [0, H].
function fitCardInBounds(
  desiredCenter: Point,
  cardRotDeg: number,
  boundsW: number,
  boundsH: number,
): { center: Point; error: number } | null {
  const r = ((cardRotDeg % 360) + 360) % 360;
  const aabbHalfW = (r === 90 || r === 270) ? CARD_H / 2 : CARD_W / 2;
  const aabbHalfH = (r === 90 || r === 270) ? CARD_W / 2 : CARD_H / 2;
  if (boundsW < aabbHalfW * 2 || boundsH < aabbHalfH * 2) return null;
  const cx = Math.max(aabbHalfW, Math.min(desiredCenter.x, boundsW - aabbHalfW));
  const cy = Math.max(aabbHalfH, Math.min(desiredCenter.y, boundsH - aabbHalfH));
  const dx = cx - desiredCenter.x;
  const dy = cy - desiredCenter.y;
  return { center: { x: cx, y: cy }, error: dx * dx + dy * dy };
}

// --- Rendered object ---

function poseToRect(pose: Pose): OrientedRect {
  return {
    center: { x: pose.x + CARD_W / 2, y: pose.y + CARD_H / 2 },
    halfSize: { x: CARD_W / 2, y: CARD_H / 2 },
    scale: 1,
    rotDeg: pose.rot,
  };
}

export type RenderedObject = {
  obj: BwcVisibleObject;
  surface: SurfaceId;
  rectInScreen: OrientedRect;
};

// Fixed gap between adjacent cards in a deck stack (in card-local units).
const DECK_CARD_GAP = 6;

// Compute the total stack offset for a deck of the given size.
// Cards fan out up and to the right with a fixed per-card gap.
// Returns { dx, dy } where the top card is shifted by (dx, -dy) from the bottom card.
export function deckStackOffset(count: number): { dx: number; dy: number } {
  const visibleCards = Math.min(count, 4);
  const offset = DECK_CARD_GAP * (visibleCards - 1);
  return { dx: offset, dy: offset };
}

function CardContent({ obj }: { obj: BwcVisibleObject }) {
  if (obj.kind === 'card') {
    return obj.faceUp && obj.card ? <CardView card={obj.card} /> : <CardBack />;
  }
  const count = obj.count;
  const visibleCards = Math.min(count, 4);
  const numBacks = visibleCards - 1;
  const topCard = obj.faceUp && obj.topCard
    ? <CardView card={obj.topCard} />
    : <CardBack />;
  return (
    <div className="bwc-deck-view">
      {Array.from({ length: numBacks }, (_, i) => (
        <div key={i} className="bwc-deck-layer" style={{
          position: 'absolute',
          bottom: DECK_CARD_GAP * i,
          left: DECK_CARD_GAP * i,
          width: '100%',
          height: '100%',
        }}>
          {obj.faceUp ? <CardFaceBlank /> : <CardBack />}
        </div>
      ))}
      <div style={{
        position: 'absolute',
        bottom: DECK_CARD_GAP * numBacks,
        left: DECK_CARD_GAP * numBacks,
        width: '100%',
        height: '100%',
      }}>
        {topCard}
      </div>
      <div className="bwc-deck-count">{count}</div>
    </div>
  );
}

// --- Draw handle for decks ---

function DrawHandle({ offset, onPointerDown }: { offset: { dx: number; dy: number }; onPointerDown: (e: React.PointerEvent) => void }) {
  // Position a full-card-sized anchor at the top card's offset,
  // then center the handle within it.
  return (
    <div style={{ position: 'absolute', left: offset.dx, bottom: offset.dy, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <div className="bwc-draw-handle" onPointerDown={e => { e.stopPropagation(); onPointerDown(e); }}>
        <svg viewBox="0 0 40 40" className="bwc-draw-handle-svg">
          <circle cx="20" cy="20" r="18" />
          <path d="M 12 20 L 26 20 M 21 13 L 28 20 L 21 27" />
        </svg>
      </div>
    </div>
  );
}

// --- ObjectView: purely presentational ---

type ObjectViewProps = {
  ro: RenderedObject;
  selected: boolean;
  displayCenter: Point;  // may differ from ro.rectInScreen.center during drag/pending
  onPointerDown: (e: React.PointerEvent, ro: RenderedObject) => void;
  onDrawHandlePointerDown: (e: React.PointerEvent, ro: RenderedObject) => void;
  onDoubleClick: (ro: RenderedObject) => void;
  onContextMenu: (e: React.PointerEvent, ro: RenderedObject) => void;
  onPointerEnter: (ro: RenderedObject) => void;
  onPointerLeave: (ro: RenderedObject) => void;
};

function ObjectView({ ro, selected, displayCenter, onPointerDown, onDrawHandlePointerDown, onDoubleClick, onContextMenu, onPointerEnter, onPointerLeave }: ObjectViewProps) {
  const rect: OrientedRect = { ...ro.rectInScreen, center: displayCenter };
  const style = orientedRectToStyle(rect);
  const isDragging = displayCenter !== ro.rectInScreen.center;

  return (
    <div
      className={`bwc-table-object${isDragging ? ' bwc-dragging' : ''}${selected ? ' bwc-selected' : ''}`}
      style={{
        ...style,
        zIndex: isDragging ? 50000 : ro.obj.z + (ro.surface.kind === 'hand' ? 20000 : 0),
      }}
      onPointerDown={e => {
        e.stopPropagation();
        if (e.button === 2) { onContextMenu(e, ro); return; }
        onPointerDown(e, ro);
      }}
      onDoubleClick={() => onDoubleClick(ro)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
      onPointerEnter={() => onPointerEnter(ro)}
      onPointerLeave={() => onPointerLeave(ro)}
    >
      <CardContent obj={ro.obj} />
      {ro.obj.kind === 'deck' && (
        <DrawHandle offset={deckStackOffset(ro.obj.count)} onPointerDown={e => onDrawHandlePointerDown(e, ro)} />
      )}
    </div>
  );
}

// Seat labels positioned in table-logical space, then projected to screen.
function SeatLabel({ seat, screenOfTable }: {
  seat: BwcClientSeat;
  screenOfTable: SE2;
}) {
  let posInTable: Point;
  const MARGIN = 20;
  switch (seat.side) {
    case 'S': posInTable = { x: seat.fraction * TABLE_LOGICAL, y: TABLE_LOGICAL - MARGIN }; break;
    case 'N': posInTable = { x: seat.fraction * TABLE_LOGICAL, y: MARGIN }; break;
    case 'E': posInTable = { x: TABLE_LOGICAL - MARGIN, y: seat.fraction * TABLE_LOGICAL }; break;
    case 'W': posInTable = { x: MARGIN, y: seat.fraction * TABLE_LOGICAL }; break;
  }
  const posInScreen = apply(screenOfTable, posInTable);

  return (
    <div
      className={`bwc-seat-label ${seat.connected ? '' : 'disconnected'}`}
      style={{
        left: posInScreen.x,
        top: posInScreen.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <span className="bwc-seat-handle">{seat.handle}</span>
    </div>
  );
}

// --- Main component ---

type Props = {
  table: BwcVisibleSurface;
  myHand: BwcVisibleSurface;
  seats: BwcClientSeat[];
  mySide: Side;
  playerId: string;
  send: (msg: ClientMessage) => void;
  onEdit: (cardId: CardId, ops: DrawOp[], name: string, cardType: string, text: string) => void;
};

export function BwcPlayArea({ table, myHand, seats, mySide, playerId, send, onEdit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(TABLE_LOGICAL);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const scale = containerWidth / TABLE_LOGICAL;
  const seatRot = SIDE_TO_ROT[mySide];
  const screenOfTable = buildScreenOfTable(scale, seatRot);
  const tableOfScreen = inverse(screenOfTable);
  const tableScreenH = TABLE_LOGICAL * scale;
  const screenOfHand = buildScreenOfHand(scale, tableScreenH); // hand starts right below the table
  const handOfScreen = inverse(screenOfHand);
  const handSurfaceId: SurfaceId = { kind: 'hand', ownerId: playerId };

  // Build rendered objects list.
  const tableObjects = table.visibility === 'full' ? table.objects : [];
  const handObjects = myHand.visibility === 'full' ? myHand.objects : [];

  const rendered: RenderedObject[] = [];
  for (const obj of tableObjects) {
    rendered.push({
      obj,
      surface: { kind: 'table' },
      rectInScreen: transformRect(screenOfTable, poseToRect(obj.pose)),
    });
  }
  for (const obj of handObjects) {
    rendered.push({
      obj,
      surface: handSurfaceId,
      rectInScreen: transformRect(screenOfHand, poseToRect(obj.pose)),
    });
  }
  rendered.sort((a, b) => a.obj.z - b.obj.z);

  // --- Pie menu state ---
  // clientCenter is in viewport coords (for gesture hit-testing).
  // The rendering offset is computed from containerRef at render time.
  type PieMenuState = { clientCenter: Point; items: PieMenuItem[] } | null;
  const [pieMenu, setPieMenu] = useState<PieMenuState>(null);

  // --- Card zoom/view state ---
  const [viewingCard, setViewingCard] = useState<BwcClientCardFull | null>(null);

  // --- Draw-drag state: when dragging from a deck's draw handle ---
  // We send bwc-draw-from-deck and wait for the new card to appear.
  type PendingDrawDrag = {
    startClient: Point;
    pointerId: number;
    prevObjectIds: Set<string>;
  };
  const pendingDrawDragRef = useRef<PendingDrawDrag | null>(null);

  // --- Interaction state (pure reducer + React wrapper) ---
  const [istate, setIstate] = useState<InteractionState>(initialInteractionState);
  const hoveredRef = useRef<string | null>(null);
  const { selection, interaction, pendingCenters } = istate;

  function getContainerOffset(): Point {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }

  function dispatch(event: Parameters<typeof reduceInteraction>[1]) {
    const ictx = { rendered, containerOffset: getContainerOffset() };
    setIstate(prev => reduceInteraction(prev, event, ictx));
  }

  // Clear pending centers when server positions change.
  const prevCentersRef = useRef(new Map<string, string>());
  useEffect(() => {
    const prev = prevCentersRef.current;
    const next = new Map<string, string>();
    for (const ro of rendered) {
      const key = `${ro.rectInScreen.center.x},${ro.rectInScreen.center.y}`;
      next.set(ro.obj.id, key);
      if (prev.get(ro.obj.id) !== key && istate.pendingCenters.has(ro.obj.id)) {
        setIstate(s => ({
          ...s,
          pendingCenters: (() => {
            const copy = new Map(s.pendingCenters);
            copy.delete(ro.obj.id);
            return copy;
          })(),
        }));
      }
    }
    prevCentersRef.current = next;

    // Detect newly drawn card and auto-start drag.
    const pdd = pendingDrawDragRef.current;
    if (pdd) {
      const currentIds = new Set(rendered.map(r => r.obj.id));
      for (const id of currentIds) {
        if (!pdd.prevObjectIds.has(id)) {
          // Found the new card — start dragging it.
          const ro = rendered.find(r => r.obj.id === id);
          if (ro) {
            pendingDrawDragRef.current = null;
            containerRef.current?.setPointerCapture(pdd.pointerId);
            setIstate(s => ({
              ...s,
              selection: new Set(),
              interaction: {
                kind: 'drag',
                objectIds: [id],
                origins: new Map([[id, ro.rectInScreen.center]]),
                fromSurfaces: new Map([[id, ro.surface]]),
                startClient: pdd.startClient,
                dx: 0,
                dy: 0,
                selectOnClick: id,
              },
            }));
          }
          break;
        }
      }
    }
  });

  // --- Surface helpers ---

  function surfaceBounds(s: SurfaceId): { w: number; h: number } {
    return s.kind === 'table'
      ? { w: TABLE_LOGICAL, h: TABLE_LOGICAL }
      : { w: HAND_LOGICAL_W, h: HAND_LOGICAL_H };
  }

  const tableRotDeg = seatRot * 90;

  function surfaceRotDeg(s: SurfaceId): number {
    return s.kind === 'table' ? tableRotDeg : 0;
  }

  // --- Drop logic (shared for single and future multi-drag) ---
  function dropObject(
    dropCenterInScreen: Point,
    fromSurface: SurfaceId,
    objectId: string,
    currentRot: number,
  ): Point | null {
    const fromRotDeg = surfaceRotDeg(fromSurface);
    function adjustedRot(toSurface: SurfaceId): number {
      const toRotDeg = surfaceRotDeg(toSurface);
      return ((currentRot + fromRotDeg - toRotDeg) % 360 + 360) % 360;
    }

    const tableSurface: SurfaceId = { kind: 'table' };
    const tableRot = adjustedRot(tableSurface);
    const centerInTable = apply(tableOfScreen, dropCenterInScreen);
    const tableFit = fitCardInBounds(centerInTable, tableRot, TABLE_LOGICAL, TABLE_LOGICAL);

    const handRot = adjustedRot(handSurfaceId);
    const centerInHand = apply(handOfScreen, dropCenterInScreen);
    const handFit = fitCardInBounds(centerInHand, handRot, HAND_LOGICAL_W, HAND_LOGICAL_H);

    type Candidate = { surface: SurfaceId; center: Point; error: number; rot: number; se2: SE2 };
    const candidates: Candidate[] = [];
    if (tableFit) candidates.push({ surface: tableSurface, ...tableFit, rot: tableRot, se2: screenOfTable });
    if (handFit) candidates.push({ surface: handSurfaceId, ...handFit, rot: handRot, se2: screenOfHand });

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.error - b.error);
      const best = candidates[0];
      send({
        type: 'bwc-move-object',
        from: fromSurface,
        objectId,
        to: best.surface,
        pose: {
          x: best.center.x - CARD_W / 2,
          y: best.center.y - CARD_H / 2,
          rot: best.rot,
        },
      });
      // Return the expected screen center for pending state.
      const expectedRect = transformRect(best.se2, {
        center: best.center,
        halfSize: { x: CARD_W / 2, y: CARD_H / 2 },
        scale: 1,
        rotDeg: best.rot,
      });
      return expectedRect.center;
    } else {
      send({ type: 'bwc-bring-to-front', surface: fromSurface, objectId });
      return null;
    }
  }

  // --- Pointer handlers ---

  const handleContainerPointerDown = useCallback((e: React.PointerEvent) => {
    // Only fires if the click was directly on the container (empty space),
    // not on a card (which calls stopPropagation).
    setPieMenu(null);
    if (e.button === 2) return; // Right-click handled by onContextMenu.
    containerRef.current?.setPointerCapture(e.pointerId);
    dispatch({
      kind: 'space-pointer-down',
      shiftKey: e.shiftKey,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }, [rendered]);

  const handleObjectPointerDown = useCallback((e: React.PointerEvent, ro: RenderedObject) => {
    if (!e.shiftKey) {
      containerRef.current?.setPointerCapture(e.pointerId);
    }
    dispatch({
      kind: 'object-pointer-down',
      objectId: ro.obj.id,
      shiftKey: e.shiftKey,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }, [rendered]);

  const handleDrawHandlePointerDown = useCallback((e: React.PointerEvent, ro: RenderedObject) => {
    if (ro.obj.kind !== 'deck') return;
    // Draw the top card, positioned where it visually appears.
    // The stack offset (dx, -dy) is in card-local space; rotate it
    // by the deck's rotation to get the offset in logical space.
    const { dx, dy } = deckStackOffset(ro.obj.count);
    const rad = ro.obj.pose.rot * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos + dy * sin;
    const ry = dx * sin - dy * cos;
    send({
      type: 'bwc-draw-from-deck',
      surface: ro.surface,
      deckId: ro.obj.id,
      to: ro.surface,
      pose: { x: ro.obj.pose.x + rx, y: ro.obj.pose.y + ry, rot: ro.obj.pose.rot },
    });
    // Remember that we want to auto-drag the newly drawn card.
    pendingDrawDragRef.current = {
      startClient: { x: e.clientX, y: e.clientY },
      pointerId: e.pointerId,
      prevObjectIds: new Set(rendered.map(r => r.obj.id)),
    };
  }, [send, rendered]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    dispatch({ kind: 'pointer-move', clientX: e.clientX, clientY: e.clientY });
  }, [rendered]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (interaction.kind === 'drag') {
      const dx = e.clientX - interaction.startClient.x;
      const dy = e.clientY - interaction.startClient.y;

      // Process drops and set pending centers.
      const newPending = new Map(pendingCenters);
      for (const objectId of interaction.objectIds) {
        const origin = interaction.origins.get(objectId)!;
        const fromSurface = interaction.fromSurfaces.get(objectId)!;
        const obj = rendered.find(ro => ro.obj.id === objectId)?.obj;
        const currentRot = obj?.pose.rot ?? 0;

        const dropCenter: Point = { x: origin.x + dx, y: origin.y + dy };
        const expectedCenter = dropObject(dropCenter, fromSurface, objectId, currentRot);
        if (expectedCenter) {
          newPending.set(objectId, expectedCenter);
        }
      }

      // Transition to idle and set pending centers atomically.
      const ictx = { rendered, containerOffset: getContainerOffset() };
      setIstate(prev => ({
        ...reduceInteraction(prev, { kind: 'pointer-up', clientX: e.clientX, clientY: e.clientY }, ictx),
        pendingCenters: newPending,
      }));
    } else {
      // Marquee up or idle — just dispatch (selection computed by reducer).
      dispatch({ kind: 'pointer-up', clientX: e.clientX, clientY: e.clientY });
    }
  }, [interaction, rendered, pendingCenters, send, tableOfScreen, handOfScreen, playerId, seatRot]);

  // --- Other actions ---

  const handleDoubleClick = useCallback((ro: RenderedObject) => {
    send({ type: 'bwc-flip-object', surface: ro.surface, objectId: ro.obj.id });
  }, [send]);

  const handleDeckAction = useCallback((action: 'draw' | 'shuffle', ro: RenderedObject) => {
    if (ro.obj.kind !== 'deck') return;
    if (action === 'draw') {
      send({
        type: 'bwc-draw-from-deck',
        surface: ro.surface,
        deckId: ro.obj.id,
        to: ro.surface,
        pose: { x: ro.obj.pose.x + CARD_W + 10, y: ro.obj.pose.y, rot: ro.obj.pose.rot },
      });
    } else {
      send({ type: 'bwc-shuffle-deck', surface: ro.surface, deckId: ro.obj.id });
    }
  }, [send]);

  // Rotate a single object around its own center, clamping to bounds.
  const rotateSingle = useCallback((objectId: string) => {
    const ro = rendered.find(r => r.obj.id === objectId);
    if (!ro) return;
    const newRot = (ro.obj.pose.rot + 90) % 360;
    const { w: boundsW, h: boundsH } = surfaceBounds(ro.surface);
    const center = { x: ro.obj.pose.x + CARD_W / 2, y: ro.obj.pose.y + CARD_H / 2 };
    const fit = fitCardInBounds(center, newRot, boundsW, boundsH);
    const finalCenter = fit ? fit.center : center;
    send({
      type: 'bwc-move-object',
      from: ro.surface,
      objectId,
      to: ro.surface,
      pose: {
        x: finalCenter.x - CARD_W / 2,
        y: finalCenter.y - CARD_H / 2,
        rot: newRot,
      },
    });
  }, [send, rendered]);

  // Rotate a group of objects around their collective center.
  // Each object's center is rotated 90° CW around the centroid,
  // and each object's individual rotation increases by 90°.
  // Final positions are clamped to stay in bounds.
  const rotateGroup = useCallback((objectIds: Set<string>) => {
    const ros = rendered.filter(r => objectIds.has(r.obj.id));
    if (ros.length === 0) return;
    if (ros.length === 1) {
      rotateSingle(ros[0].obj.id);
      return;
    }

    const surface = ros[0].surface;
    const { w: boundsW, h: boundsH } = surfaceBounds(surface);

    // Compute centroid in logical space.
    let cx = 0, cy = 0;
    for (const ro of ros) {
      cx += ro.obj.pose.x + CARD_W / 2;
      cy += ro.obj.pose.y + CARD_H / 2;
    }
    cx /= ros.length;
    cy /= ros.length;

    send({
      type: 'bwc-batch',
      messages: ros.map(ro => {
        const centerX = ro.obj.pose.x + CARD_W / 2;
        const centerY = ro.obj.pose.y + CARD_H / 2;
        const dx = centerX - cx;
        const dy = centerY - cy;
        const newCenterX = cx - dy;
        const newCenterY = cy + dx;
        const newRot = (ro.obj.pose.rot + 90) % 360;

        const fit = fitCardInBounds({ x: newCenterX, y: newCenterY }, newRot, boundsW, boundsH);
        const finalCenter = fit ? fit.center : { x: newCenterX, y: newCenterY };

        return {
          type: 'bwc-move-object' as const,
          from: surface,
          objectId: ro.obj.id,
          to: surface,
          pose: {
            x: finalCenter.x - CARD_W / 2,
            y: finalCenter.y - CARD_H / 2,
            rot: newRot,
          },
        };
      }),
    });
  }, [send, rendered, rotateSingle]);

  function isCollectable(ros: RenderedObject[]): boolean {
    if (ros.length < 2) return false;
    const surface = ros[0].surface;
    return ros.every(r =>
      r.surface.kind === surface.kind &&
      (r.surface.kind === 'table' || (r.surface.kind === 'hand' && surface.kind === 'hand' && r.surface.ownerId === surface.ownerId))
    );
  }

  function doCollect(ros: RenderedObject[]) {
    const surface = ros[0].surface;
    let cx = 0, cy = 0;
    for (const ro of ros) {
      cx += ro.obj.pose.x + CARD_W / 2;
      cy += ro.obj.pose.y + CARD_H / 2;
    }
    cx /= ros.length;
    cy /= ros.length;
    send({
      type: 'bwc-form-deck',
      surface,
      objectIds: ros.map(r => r.obj.id),
      pose: { x: cx - CARD_W / 2, y: cy - CARD_H / 2, rot: 0 },
    });
    setIstate(s => ({ ...s, selection: new Set() }));
  }

  function buildPieItems(ros: RenderedObject[]): PieMenuItem[] {
    const items: PieMenuItem[] = [];
    const ids = new Set(ros.map(r => r.obj.id));

    // Single-deck actions.
    if (ros.length === 1 && ros[0].obj.kind === 'deck') {
      const ro = ros[0];
      items.push({
        label: 'Draw (D)',
        action: () => send({
          type: 'bwc-draw-from-deck',
          surface: ro.surface,
          deckId: ro.obj.id,
          to: ro.surface,
          pose: { x: ro.obj.pose.x + CARD_W + 10, y: ro.obj.pose.y, rot: ro.obj.pose.rot },
        }),
      });
      items.push({
        label: 'Shuffle (S)',
        action: () => send({ type: 'bwc-shuffle-deck', surface: ro.surface, deckId: ro.obj.id }),
      });
    }

    // Single face-up card actions.
    if (ros.length === 1 && ros[0].obj.kind === 'card' && ros[0].obj.faceUp && ros[0].obj.card) {
      const card = ros[0].obj.card;
      items.push({
        label: 'View (V)',
        action: () => setViewingCard(card),
      });
      items.push({
        label: 'Edit',
        action: () => onEdit(card.id, card.ops, card.name, card.cardType, card.text),
      });
    }

    items.push({
      label: 'Rotate (R)',
      action: () => rotateGroup(ids),
    });

    if (isCollectable(ros)) {
      items.push({
        label: 'Collect as Deck (C)',
        action: () => doCollect(ros),
      });
    }

    items.push({
      label: 'Flip (F)',
      action: () => {
        send({
          type: 'bwc-batch',
          messages: ros.map(ro => ({ type: 'bwc-flip-object', surface: ro.surface, objectId: ro.obj.id })),
        });
      },
    });
    items.push({
      label: 'Delete',
      action: () => {
        send({
          type: 'bwc-batch',
          messages: ros.map(ro => ({ type: 'bwc-delete-object', surface: ro.surface, objectId: ro.obj.id })),
        });
        setIstate(s => ({ ...s, selection: new Set() }));
      },
    });

    return items;
  }

  const handleContextMenu = useCallback((e: React.PointerEvent, ro: RenderedObject) => {
    const cc: Point = { x: e.clientX, y: e.clientY };

    // If there's a selection and we didn't right-click a deck, target the selection.
    if (istate.selection.size > 0 && ro.obj.kind !== 'deck') {
      const selectedRos = rendered.filter(r => istate.selection.has(r.obj.id));
      setPieMenu({ clientCenter: cc, items: buildPieItems(selectedRos) });
    } else {
      setPieMenu({ clientCenter: cc, items: buildPieItems([ro]) });
    }
  }, [send, rotateSingle, onEdit, istate.selection, rendered]);

  function findRendered(objectId: string): RenderedObject | undefined {
    return rendered.find(ro => ro.obj.id === objectId);
  }

  // Keyboard shortcuts.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (viewingCard) {
        setViewingCard(null);
        return;
      }

      // Selection if non-empty, else currently dragged objects, else hovered.
      function getTargets(): RenderedObject[] {
        if (istate.selection.size > 0) {
          return rendered.filter(r => istate.selection.has(r.obj.id));
        }
        const inter = istate.interaction;
        if (inter.kind === 'drag') {
          return rendered.filter(r => inter.objectIds.includes(r.obj.id));
        }
        if (hoveredRef.current) {
          const ro = findRendered(hoveredRef.current);
          if (ro) return [ro];
        }
        return [];
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        send({ type: 'bwc-tidy-hand' });
        return;
      }

      const targets = getTargets();
      if (targets.length === 0) return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotateGroup(new Set(targets.map(t => t.obj.id)));
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        send({
          type: 'bwc-batch',
          messages: targets.map(ro => ({ type: 'bwc-flip-object', surface: ro.surface, objectId: ro.obj.id })),
        });
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        if (targets.length === 1) {
          const ro = targets[0];
          if (ro.obj.kind === 'card' && ro.obj.faceUp && ro.obj.card) {
            e.preventDefault();
            setViewingCard(ro.obj.card);
          }
        }
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        if (isCollectable(targets)) {
          e.preventDefault();
          doCollect(targets);
        }
        return;
      }

      // D and S only apply to a single hovered deck.
      if (targets.length === 1 && targets[0].obj.kind === 'deck') {
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          handleDeckAction('draw', targets[0]);
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          handleDeckAction('shuffle', targets[0]);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [rotateSingle, rotateGroup, handleDeckAction, rendered, istate.selection, istate.interaction, viewingCard]);

  return (
    <div
      ref={containerRef}
      className="bwc-spaces"
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={e => {
        e.preventDefault();
        if (istate.selection.size > 0) {
          const cc: Point = { x: e.clientX, y: e.clientY };
          const selectedRos = rendered.filter(r => istate.selection.has(r.obj.id));
          setPieMenu({ clientCenter: cc, items: buildPieItems(selectedRos) });
        }
      }}
    >
      {/* Table background */}
      <div className="bwc-table" />
      {/* Hand background */}
      <div className="bwc-hand" />

      {/* Seat labels */}
      {seats.map(seat => (
        <SeatLabel
          key={seat.playerId}
          seat={seat}
          screenOfTable={screenOfTable}
        />
      ))}

      {/* All objects */}
      {rendered.map(ro => (
        <ObjectView
          key={ro.obj.id}
          ro={ro}
          selected={selection.has(ro.obj.id)}
          displayCenter={getDisplayCenter(ro, istate)}
          onPointerDown={handleObjectPointerDown}
          onDrawHandlePointerDown={handleDrawHandlePointerDown}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onPointerEnter={ro => { hoveredRef.current = ro.obj.id; }}
          onPointerLeave={ro => { if (hoveredRef.current === ro.obj.id && !viewingCard) hoveredRef.current = null; }}
        />
      ))}

      {/* Marquee selection rectangle */}
      {(() => {
        const mr = getMarqueeRect(istate, getContainerOffset());
        if (!mr) return null;
        return (
          <div className="bwc-marquee" style={{
            position: 'absolute',
            left: mr.left,
            top: mr.top,
            width: mr.width,
            height: mr.height,
          }} />
        );
      })()}

      {/* Pie menu */}
      {pieMenu && (() => {
        const off = getContainerOffset();
        return (
          <PieMenu
            position={{ x: pieMenu.clientCenter.x - off.x, y: pieMenu.clientCenter.y - off.y }}
            clientCenter={pieMenu.clientCenter}
            items={pieMenu.items}
            onClose={() => setPieMenu(null)}
            gesture={true}
          />
        );
      })()}

      {/* Card zoom overlay */}
      {viewingCard && (
        <div className="bwc-card-zoom-overlay" onPointerDown={e => { e.stopPropagation(); setViewingCard(null); }}>
          <div className="bwc-card-zoom-card" style={orientedRectToStyle({
            center: { x: containerWidth / 2, y: (tableScreenH + HAND_LOGICAL_H * scale) / 2 },
            halfSize: { x: CARD_W / 2, y: CARD_H / 2 },
            scale: Math.min(
              (tableScreenH + HAND_LOGICAL_H * scale) * 0.7 / CARD_H,
              containerWidth * 0.7 / CARD_W,
            ),
            rotDeg: 0,
          })}>
            <CardView card={viewingCard} />
          </div>
        </div>
      )}
    </div>
  );
}
