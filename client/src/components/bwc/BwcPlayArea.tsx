import { useRef, useCallback, useEffect, useState } from 'react';
import type {
  BwcVisibleObject, BwcVisibleSurface, BwcClientSeat,
  ClientMessage, Pose, Side, SurfaceId,
} from '../../types';
import { CardView, CardBack } from './CardView';
import { SE2, apply, composen, inverse, mkTranslate, mkScale, mkRotate, type Rot } from '../../../../util/se2';
import type { Point } from '../../../../util/types';
import { transformRect, orientedRectToStyle, type OrientedRect } from '../../../../util/oriented-rect';

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
// Returns null if the card can't fit at all (surface too small).
function fitCardInBounds(
  desiredCenter: Point,
  cardRotDeg: number,
  boundsW: number,
  boundsH: number,
): { center: Point; error: number } | null {
  // AABB half-size depends on whether the card is rotated by 90° or 270°.
  const r = ((cardRotDeg % 360) + 360) % 360;
  const aabbHalfW = (r === 90 || r === 270) ? CARD_H / 2 : CARD_W / 2;
  const aabbHalfH = (r === 90 || r === 270) ? CARD_W / 2 : CARD_H / 2;

  // Check if the card can fit at all.
  if (boundsW < aabbHalfW * 2 || boundsH < aabbHalfH * 2) return null;

  // Clamp center so AABB stays within bounds.
  const cx = Math.max(aabbHalfW, Math.min(desiredCenter.x, boundsW - aabbHalfW));
  const cy = Math.max(aabbHalfH, Math.min(desiredCenter.y, boundsH - aabbHalfH));

  const dx = cx - desiredCenter.x;
  const dy = cy - desiredCenter.y;
  return { center: { x: cx, y: cy }, error: dx * dx + dy * dy };
}

// --- Rendered object ---

// A card's pose in logical space as an oriented rectangle.
function poseToRect(pose: Pose): OrientedRect {
  return {
    center: { x: pose.x + CARD_W / 2, y: pose.y + CARD_H / 2 },
    halfSize: { x: CARD_W / 2, y: CARD_H / 2 },
    rotDeg: pose.rot,
  };
}

// Recover a Pose (top-left corner + rotation) from a logical-space oriented rect.
function rectToPose(rect: OrientedRect): Pose {
  return {
    x: rect.center.x - CARD_W / 2,
    y: rect.center.y - CARD_H / 2,
    rot: ((rect.rotDeg % 360) + 360) % 360,
  };
}

type RenderedObject = {
  obj: BwcVisibleObject;
  surface: SurfaceId;
  rectInScreen: OrientedRect;
};

function CardContent({ obj }: { obj: BwcVisibleObject }) {
  if (obj.kind === 'card') {
    return obj.faceUp && obj.card ? <CardView card={obj.card} /> : <CardBack />;
  }
  return (
    <div className="bwc-deck-view">
      <CardBack />
      <div className="bwc-deck-count">{obj.count}</div>
    </div>
  );
}

// Each ObjectView manages its own drag state internally so the same
// DOM element persists through the drag and pointer capture is never lost.
type ObjectViewProps = {
  ro: RenderedObject;
  onDrop: (dropCenterInScreen: Point, fromSurface: SurfaceId, objectId: string, currentRot: number) => void;
  onDoubleClick: (ro: RenderedObject) => void;
  onContextMenu: (e: React.MouseEvent, ro: RenderedObject) => void;
  onPointerEnter: (ro: RenderedObject) => void;
  onPointerLeave: (ro: RenderedObject) => void;
  draggingIdRef: React.MutableRefObject<string | null>;
};

// Local position override: either actively dragging (offset from server
// position) or pending server confirmation (fixed screen center).
type LocalOverride =
  | { kind: 'dragging'; offset: Point }
  | { kind: 'pending'; center: Point };

function ObjectView({ ro, onDrop, onDoubleClick, onContextMenu, onPointerEnter, onPointerLeave, draggingIdRef }: ObjectViewProps) {
  const [override, setOverride] = useState<LocalOverride | null>(null);
  const startRef = useRef<Point | null>(null);

  // When the server position changes (broadcast arrived), clear the
  // pending override so we snap to the server's authoritative position.
  const prevCenterRef = useRef(ro.rectInScreen.center);
  useEffect(() => {
    const prev = prevCenterRef.current;
    if (prev.x !== ro.rectInScreen.center.x || prev.y !== ro.rectInScreen.center.y) {
      if (override?.kind === 'pending') {
        setOverride(null);
      }
      prevCenterRef.current = ro.rectInScreen.center;
    }
  });

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setOverride({ kind: 'dragging', offset: { x: 0, y: 0 } });
    draggingIdRef.current = ro.obj.id;
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = startRef.current;
    if (!start) return;
    setOverride({
      kind: 'dragging',
      offset: { x: e.clientX - start.x, y: e.clientY - start.y },
    });
  }

  function handlePointerUp(e: React.PointerEvent) {
    const start = startRef.current;
    if (!start) return;
    startRef.current = null;
    draggingIdRef.current = null;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dropCenter: Point = {
      x: ro.rectInScreen.center.x + dx,
      y: ro.rectInScreen.center.y + dy,
    };
    // Keep showing the card at the drop position until server confirms.
    setOverride({ kind: 'pending', center: dropCenter });
    onDrop(
      dropCenter,
      ro.surface,
      ro.obj.id,
      ro.obj.pose.rot,
    );
  }

  let displayCenter: Point;
  if (override?.kind === 'dragging') {
    displayCenter = {
      x: ro.rectInScreen.center.x + override.offset.x,
      y: ro.rectInScreen.center.y + override.offset.y,
    };
  } else if (override?.kind === 'pending') {
    displayCenter = override.center;
  } else {
    displayCenter = ro.rectInScreen.center;
  }

  const rect: OrientedRect = { ...ro.rectInScreen, center: displayCenter };
  const style = orientedRectToStyle(rect);
  const isDragging = override?.kind === 'dragging';

  return (
    <div
      className={`bwc-table-object${isDragging ? ' bwc-dragging' : ''}`}
      style={{
        ...style,
        zIndex: isDragging ? 50000 : ro.obj.z + (ro.surface.kind === 'hand' ? 20000 : 0),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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
function SeatLabel({ seat, screenOfTable }: { seat: BwcClientSeat; screenOfTable: SE2 }) {
  // Position along the edge in table-logical space.
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
      {seat.handle}
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

  // Measure container width.
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
    const rectInLogical = poseToRect(obj.pose);
    rendered.push({
      obj,
      surface: { kind: 'table' },
      rectInScreen: transformRect(screenOfTable, rectInLogical),
    });
  }
  for (const obj of handObjects) {
    const rectInLogical = poseToRect(obj.pose);
    rendered.push({
      obj,
      surface: handSurfaceId,
      rectInScreen: transformRect(screenOfHand, rectInLogical),
    });
  }
  rendered.sort((a, b) => a.obj.z - b.obj.z);

  // --- Drag state ---
  // Each ObjectView manages its own drag offset internally. The parent
  // only needs to know which object is being dragged (for the R key).
  const draggingIdRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);

  // Rotation contribution from each surface's SE2 (degrees).
  const tableRotDeg = seatRot * 90;
  const handRotDeg = 0;

  function surfaceRotDeg(s: SurfaceId): number {
    return s.kind === 'table' ? tableRotDeg : handRotDeg;
  }

  const handleDrop = useCallback((
    dropCenterInScreen: Point,
    fromSurface: SurfaceId,
    objectId: string,
    currentRot: number,
  ) => {
    // The card's screen rotation during drag is currentRot + fromSurfaceRot.
    // When dropping on a target surface, adjust pose.rot to preserve
    // the same screen rotation: newRot + toSurfaceRot = currentRot + fromSurfaceRot.
    const fromRotDeg = surfaceRotDeg(fromSurface);

    function adjustedRot(toSurface: SurfaceId): number {
      const toRotDeg = surfaceRotDeg(toSurface);
      return ((currentRot + fromRotDeg - toRotDeg) % 360 + 360) % 360;
    }

    // For each surface, inverse-transform the drop center to logical space
    // and find the nearest fully-in-bounds placement.
    const tableSurface: SurfaceId = { kind: 'table' };
    const tableRot = adjustedRot(tableSurface);
    const centerInTable = apply(tableOfScreen, dropCenterInScreen);
    const tableFit = fitCardInBounds(centerInTable, tableRot, TABLE_LOGICAL, TABLE_LOGICAL);

    const handRot = adjustedRot(handSurfaceId);
    const centerInHand = apply(handOfScreen, dropCenterInScreen);
    const handFit = fitCardInBounds(centerInHand, handRot, HAND_LOGICAL_W, HAND_LOGICAL_H);

    // Pick the surface with least error.
    type Candidate = { surface: SurfaceId; center: Point; error: number; rot: number };
    const candidates: Candidate[] = [];
    if (tableFit) candidates.push({ surface: tableSurface, ...tableFit, rot: tableRot });
    if (handFit) candidates.push({ surface: handSurfaceId, ...handFit, rot: handRot });

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
    } else {
      send({ type: 'bwc-bring-to-front', surface: fromSurface, objectId });
    }
  }, [send, tableOfScreen, handOfScreen, playerId, seatRot]);

  const handleDoubleClick = useCallback((ro: RenderedObject) => {
    send({ type: 'bwc-flip-object', surface: ro.surface, objectId: ro.obj.id });
  }, [send]);

  const handleContextMenu = useCallback((_e: React.MouseEvent, ro: RenderedObject) => {
    send({ type: 'bwc-delete-object', surface: ro.surface, objectId: ro.obj.id });
  }, [send]);

  // "R" key to rotate hovered object.
  const handleRotate = useCallback((objectId: string) => {
    // Find the object in either surface.
    const tableObj = tableObjects.find(o => o.id === objectId);
    if (tableObj) {
      const newRot = (tableObj.pose.rot + 90) % 360;
      send({
        type: 'bwc-move-object',
        from: { kind: 'table' },
        objectId,
        to: { kind: 'table' },
        pose: { ...tableObj.pose, rot: newRot },
      });
      return;
    }
    const handObj = handObjects.find(o => o.id === objectId);
    if (handObj) {
      const newRot = (handObj.pose.rot + 90) % 360;
      send({
        type: 'bwc-move-object',
        from: handSurfaceId,
        objectId,
        to: handSurfaceId,
        pose: { ...handObj.pose, rot: newRot },
      });
    }
  }, [send, tableObjects, handObjects, playerId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') {
        const targetId = draggingIdRef.current ?? hoveredRef.current;
        if (targetId) {
          e.preventDefault();
          handleRotate(targetId);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleRotate]);

  const totalHeight = tableScreenH + GAP + HAND_LOGICAL_H * scale;

  // Debug: verify transforms with a test point.
  const testPtInTable = { x: 0, y: 0 };
  const testPtInScreen = apply(screenOfTable, testPtInTable);
  const roundTrip = apply(tableOfScreen, testPtInScreen);

  return (
    <div
      ref={containerRef}
      className="bwc-play-area"
      style={{ maxWidth: TABLE_LOGICAL, height: totalHeight }}
    >
      {/* Debug overlay */}
      <div className="bwc-debug" style={{
        position: 'fixed', top: 0, right: 0, background: 'rgba(0,0,0,0.85)',
        color: '#0f0', fontFamily: 'monospace', fontSize: '11px', padding: '8px',
        zIndex: 99999, maxWidth: '400px', maxHeight: '90vh', overflow: 'auto',
        pointerEvents: 'none',
      }}>
        <div>mySide={mySide} seatRot={seatRot} seatRotDeg={seatRot * 90}</div>
        <div>scale={scale.toFixed(3)} containerW={containerWidth}</div>
        <div>screenOfTable: rot={screenOfTable.rot} s={screenOfTable.scale.toFixed(3)} t=({screenOfTable.translate.x.toFixed(1)},{screenOfTable.translate.y.toFixed(1)})</div>
        <div>screenOfHand: rot={screenOfHand.rot} s={screenOfHand.scale.toFixed(3)} t=({screenOfHand.translate.x.toFixed(1)},{screenOfHand.translate.y.toFixed(1)})</div>
        <div>test: table(0,0) → screen({testPtInScreen.x.toFixed(1)},{testPtInScreen.y.toFixed(1)}) → table({roundTrip.x.toFixed(1)},{roundTrip.y.toFixed(1)})</div>
        <div>dragging: (see draggingIdRef)</div>
        <div style={{ marginTop: 4 }}>--- rendered objects ---</div>
        {rendered.map(ro => {
          const s = ro.surface.kind === 'table' ? 'T' : 'H';
          return (
            <div key={ro.obj.id}>
              {ro.obj.id}[{s}]: pose=({ro.obj.pose.x.toFixed(0)},{ro.obj.pose.y.toFixed(0)},r{ro.obj.pose.rot})
              → center=({ro.rectInScreen.center.x.toFixed(0)},{ro.rectInScreen.center.y.toFixed(0)})
              half=({ro.rectInScreen.halfSize.x.toFixed(0)},{ro.rectInScreen.halfSize.y.toFixed(0)})
              rot={ro.rectInScreen.rotDeg}
            </div>
          );
        })}
      </div>

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
        />
      ))}

      {/* All objects — each manages its own drag state internally */}
      {rendered.map(ro => (
        <ObjectView
          key={ro.obj.id}
          ro={ro}
          onDrop={handleDrop}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onPointerEnter={ro => { hoveredRef.current = ro.obj.id; }}
          onPointerLeave={ro => { if (hoveredRef.current === ro.obj.id) hoveredRef.current = null; }}
          draggingIdRef={draggingIdRef}
        />
      ))}
    </div>
  );
}
