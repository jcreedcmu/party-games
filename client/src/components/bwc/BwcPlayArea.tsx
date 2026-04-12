import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type {
  BwcVisibleObject, BwcVisibleSurface, BwcClientSeat,
  ClientMessage, Pose, Side, SurfaceId,
} from '../../types';
import { CardView, CardBack } from './CardView';
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

// Logical dimensions.
const TABLE_LOGICAL = 800;
const HAND_LOGICAL_W = 800;
const HAND_LOGICAL_H = 200;
const GAP = 8; // screen px between table and hand
const CARD_W = 100;  // logical width of a card
const CARD_H = 140;  // logical height (5:7 aspect ratio, matching standard playing cards)

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
    mkTranslate({ x: 0, y: tableScreenH + GAP }),
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
    rotDeg: pose.rot,
  };
}

export type RenderedObject = {
  obj: BwcVisibleObject;
  surface: SurfaceId;
  rectInScreen: OrientedRect;
};

function CardContent({ obj }: { obj: BwcVisibleObject }) {
  if (obj.kind === 'card') {
    return obj.faceUp && obj.card ? <CardView card={obj.card} /> : <CardBack />;
  }
  const count = obj.count;
  const PX_PER_CARD = 2;
  const MIN_OFFSET = 6;
  const MAX_OFFSET = 24;
  const stackOffset = Math.min(MIN_OFFSET + (count - 1) * PX_PER_CARD, MAX_OFFSET);
  const numLayers = Math.min(count - 1, 3);
  const topCard = obj.faceUp && obj.topCard
    ? <CardView card={obj.topCard} />
    : <CardBack />;
  return (
    <div className="bwc-deck-view">
      {Array.from({ length: numLayers }, (_, i) => {
        const frac = 1 - (i + 1) / (numLayers + 1);
        return (
          <div key={i} className="bwc-deck-layer" style={{
            position: 'absolute',
            bottom: stackOffset * frac,
            left: -stackOffset * frac,
            width: '100%',
            height: '100%',
          }}>
            <CardBack />
          </div>
        );
      })}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {topCard}
      </div>
      <div className="bwc-deck-count">{count}</div>
    </div>
  );
}

// --- ObjectView: purely presentational ---

type ObjectViewProps = {
  ro: RenderedObject;
  selected: boolean;
  displayCenter: Point;  // may differ from ro.rectInScreen.center during drag/pending
  onPointerDown: (e: React.PointerEvent, ro: RenderedObject) => void;
  onDoubleClick: (ro: RenderedObject) => void;
  onContextMenu: (e: React.MouseEvent, ro: RenderedObject) => void;
  onPointerEnter: (ro: RenderedObject) => void;
  onPointerLeave: (ro: RenderedObject) => void;
};

function ObjectView({ ro, selected, displayCenter, onPointerDown, onDoubleClick, onContextMenu, onPointerEnter, onPointerLeave }: ObjectViewProps) {
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
      onPointerDown={e => { e.stopPropagation(); onPointerDown(e, ro); }}
      onDoubleClick={() => onDoubleClick(ro)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, ro); }}
      onPointerEnter={() => onPointerEnter(ro)}
      onPointerLeave={() => onPointerLeave(ro)}
    >
      <CardContent obj={ro.obj} />
    </div>
  );
}

// Seat labels positioned in table-logical space, then projected to screen.
function SeatLabel({ seat, screenOfTable, send }: {
  seat: BwcClientSeat;
  screenOfTable: SE2;
  send: (msg: ClientMessage) => void;
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
      <span className="bwc-seat-score">
        <button
          className="bwc-score-btn"
          onClick={() => send({ type: 'bwc-adjust-score', playerId: seat.playerId, delta: -1 })}
        >-</button>
        <span className="bwc-score-value">{seat.score}</span>
        <button
          className="bwc-score-btn"
          onClick={() => send({ type: 'bwc-adjust-score', playerId: seat.playerId, delta: 1 })}
        >+</button>
      </span>
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
};

export function BwcPlayArea({ table, myHand, seats, mySide, playerId, send }: Props) {
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
  const screenOfHand = buildScreenOfHand(scale, tableScreenH);
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

  const handleContextMenu = useCallback((_e: React.MouseEvent, ro: RenderedObject) => {
    if (ro.obj.kind === 'deck') {
      send({
        type: 'bwc-draw-from-deck',
        surface: ro.surface,
        deckId: ro.obj.id,
        to: ro.surface,
        pose: { x: ro.obj.pose.x + CARD_W + 10, y: ro.obj.pose.y, rot: ro.obj.pose.rot },
      });
    } else {
      send({ type: 'bwc-delete-object', surface: ro.surface, objectId: ro.obj.id });
    }
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

    for (const ro of ros) {
      const centerX = ro.obj.pose.x + CARD_W / 2;
      const centerY = ro.obj.pose.y + CARD_H / 2;
      const dx = centerX - cx;
      const dy = centerY - cy;
      const newCenterX = cx + dy;
      const newCenterY = cy - dx;
      const newRot = (ro.obj.pose.rot + 90) % 360;

      // Clamp to keep card in bounds.
      const fit = fitCardInBounds({ x: newCenterX, y: newCenterY }, newRot, boundsW, boundsH);
      const finalCenter = fit ? fit.center : { x: newCenterX, y: newCenterY };

      send({
        type: 'bwc-move-object',
        from: surface,
        objectId: ro.obj.id,
        to: surface,
        pose: {
          x: finalCenter.x - CARD_W / 2,
          y: finalCenter.y - CARD_H / 2,
          rot: newRot,
        },
      });
    }
  }, [send, rendered, rotateSingle]);

  function findRendered(objectId: string): RenderedObject | undefined {
    return rendered.find(ro => ro.obj.id === objectId);
  }

  // Keyboard shortcuts.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (istate.selection.size > 0) {
          // Selection takes priority: rotate the group.
          rotateGroup(istate.selection);
        } else if (hoveredRef.current) {
          // No selection: rotate the hovered card.
          rotateSingle(hoveredRef.current);
        }
        return;
      }

      // D and S target hovered object only.
      const targetId = hoveredRef.current;
      if (!targetId) return;
      if (e.key === 'd' || e.key === 'D') {
        const ro = findRendered(targetId);
        if (ro && ro.obj.kind === 'deck') {
          e.preventDefault();
          handleDeckAction('draw', ro);
        }
      } else if (e.key === 's' || e.key === 'S') {
        const ro = findRendered(targetId);
        if (ro && ro.obj.kind === 'deck') {
          e.preventDefault();
          handleDeckAction('shuffle', ro);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [rotateSingle, rotateGroup, handleDeckAction, rendered, istate.selection]);

  const totalHeight = tableScreenH + GAP + HAND_LOGICAL_H * scale;

  return (
    <div
      ref={containerRef}
      className="bwc-play-area"
      style={{ height: totalHeight }}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Selection actions */}
      {istate.selection.size >= 2 && (() => {
        // Check if selection is all cards on the same surface.
        const selectedRos = rendered.filter(r => istate.selection.has(r.obj.id));
        const allCards = selectedRos.every(r => r.obj.kind === 'card');
        const surface = selectedRos[0]?.surface;
        const sameSurface = surface && selectedRos.every(r =>
          r.surface.kind === surface.kind &&
          (r.surface.kind === 'table' || (r.surface.kind === 'hand' && surface.kind === 'hand' && r.surface.ownerId === surface.ownerId))
        );
        if (!allCards || !sameSurface) return null;

        // Compute centroid for deck placement.
        let cx = 0, cy = 0;
        for (const ro of selectedRos) {
          cx += ro.obj.pose.x + CARD_W / 2;
          cy += ro.obj.pose.y + CARD_H / 2;
        }
        cx /= selectedRos.length;
        cy /= selectedRos.length;

        return (
          <div className="bwc-selection-actions">
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => {
                send({
                  type: 'bwc-form-deck',
                  surface,
                  objectIds: selectedRos.map(r => r.obj.id),
                  pose: { x: cx - CARD_W / 2, y: cy - CARD_H / 2, rot: 0 },
                });
                setIstate(s => ({ ...s, selection: new Set() }));
              }}
            >
              Form Deck ({selectedRos.length} cards)
            </button>
          </div>
        );
      })()}

      {/* Table background */}
      <div
        className="bwc-table-bg"
        style={{ width: containerWidth, height: tableScreenH }}
      />
      {/* Hand background */}
      <div
        className="bwc-hand-bg"
        style={{
          width: containerWidth,
          height: HAND_LOGICAL_H * scale,
          top: tableScreenH + GAP,
        }}
      />

      {/* Seat labels */}
      {seats.map(seat => (
        <SeatLabel
          key={seat.playerId}
          seat={seat}
          screenOfTable={screenOfTable}
          send={send}
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
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onPointerEnter={ro => { hoveredRef.current = ro.obj.id; }}
          onPointerLeave={ro => { if (hoveredRef.current === ro.obj.id) hoveredRef.current = null; }}
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
    </div>
  );
}
