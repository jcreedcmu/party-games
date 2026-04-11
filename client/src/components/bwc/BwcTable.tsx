import { useRef, useCallback, useEffect } from 'react';
import type { BwcVisibleObject, BwcVisibleSurface, BwcClientCardSummary, BwcClientSeat, ClientMessage, Pose, Side, SurfaceId } from '../../types';
import { CardView, CardBack } from './CardView';

const TABLE_SIZE = 800; // logical px
const CARD_W = 160;

// Rotation to apply so the player's own side appears at the bottom.
const SIDE_ROTATION: Record<Side, number> = {
  S: 0,
  E: 90,
  N: 180,
  W: 270,
};

type TableObjectProps = {
  obj: BwcVisibleObject;
  onDragEnd: (objectId: string, pose: Pose) => void;
  onFlip: (objectId: string) => void;
  onDelete: (objectId: string) => void;
  onBringToFront: (objectId: string) => void;
  onRotate: (objectId: string) => void;
  hoveredRef: React.MutableRefObject<string | null>;
  draggingRef: React.MutableRefObject<string | null>;
};

function TableObjectView({ obj, onDragEnd, onFlip, onDelete, onBringToFront, onRotate, hoveredRef, draggingRef }: TableObjectProps) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    const el = elRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    onBringToFront(obj.id);
    draggingRef.current = obj.id;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: obj.pose.x,
      origY: obj.pose.y,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const el = elRef.current;
    if (!el) return;
    const tableEl = el.closest('.bwc-table-inner') as HTMLElement | null;
    if (!tableEl) return;
    const scale = tableEl.clientWidth / TABLE_SIZE;
    // Account for the table rotation when mapping mouse deltas to table coords.
    const rotDeg = Number(tableEl.dataset.rotation ?? 0);
    const rotRad = (rotDeg * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const rawDx = (e.clientX - drag.startX) / scale;
    const rawDy = (e.clientY - drag.startY) / scale;
    // Inverse-rotate the mouse delta to get table-space delta.
    const dx = rawDx * cosR + rawDy * sinR;
    const dy = -rawDx * sinR + rawDy * cosR;
    el.style.left = `${drag.origX + dx}px`;
    el.style.top = `${drag.origY + dy}px`;
  }

  function handlePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    draggingRef.current = null;
    const el = elRef.current;
    if (!el) return;
    const tableEl = el.closest('.bwc-table-inner') as HTMLElement | null;
    if (!tableEl) return;
    const scale = tableEl.clientWidth / TABLE_SIZE;
    const rotDeg = Number(tableEl.dataset.rotation ?? 0);
    const rotRad = (rotDeg * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const rawDx = (e.clientX - drag.startX) / scale;
    const rawDy = (e.clientY - drag.startY) / scale;
    const dx = rawDx * cosR + rawDy * sinR;
    const dy = -rawDx * sinR + rawDy * cosR;
    onDragEnd(obj.id, { x: drag.origX + dx, y: drag.origY + dy, rot: obj.pose.rot });
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onFlip(obj.id);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onDelete(obj.id);
  }

  const content = obj.kind === 'card'
    ? (obj.faceUp && obj.card ? <CardView card={obj.card} /> : <CardBack />)
    : (
      <div className="bwc-deck-view">
        <CardBack />
        <div className="bwc-deck-count">{obj.count}</div>
      </div>
    );

  return (
    <div
      ref={elRef}
      className="bwc-table-object"
      style={{
        left: obj.pose.x,
        top: obj.pose.y,
        zIndex: obj.z,
        width: CARD_W,
        transform: `rotate(${obj.pose.rot}deg)`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}

      onPointerEnter={() => { hoveredRef.current = obj.id; }}
      onPointerLeave={() => { if (hoveredRef.current === obj.id) hoveredRef.current = null; }}
    >
      {content}
    </div>
  );
}

// Compute CSS position for a seat label along the edge of the table.
// Positions are in table-space (pre-rotation).
function seatLabelStyle(seat: BwcClientSeat): React.CSSProperties {
  const MARGIN = 10;
  switch (seat.side) {
    case 'S':
      return { left: `${seat.fraction * 100}%`, bottom: MARGIN, transform: 'translateX(-50%)' };
    case 'N':
      return { left: `${seat.fraction * 100}%`, top: MARGIN, transform: 'translateX(-50%)' };
    case 'E':
      return { top: `${seat.fraction * 100}%`, right: MARGIN, transform: 'translateY(-50%)' };
    case 'W':
      return { top: `${seat.fraction * 100}%`, left: MARGIN, transform: 'translateY(-50%)' };
  }
}

type Props = {
  table: BwcVisibleSurface;
  library: BwcClientCardSummary[];
  seats: BwcClientSeat[];
  mySide: Side;
  send: (msg: ClientMessage) => void;
};

export function BwcTable({ table, library, seats, mySide, send }: Props) {
  const surfaceId: SurfaceId = { kind: 'table' };
  const rotation = SIDE_ROTATION[mySide];
  const hoveredRef = useRef<string | null>(null);
  const draggingRef = useRef<string | null>(null);

  const handleRotate = useCallback((objectId: string) => {
    // Find current object to compute new rotation.
    if (table.visibility !== 'full') return;
    const obj = table.objects.find(o => o.id === objectId);
    if (!obj) return;
    const newRot = (obj.pose.rot + 90) % 360;
    send({
      type: 'bwc-move-object',
      from: surfaceId,
      objectId,
      to: surfaceId,
      pose: { ...obj.pose, rot: newRot },
    });
  }, [send, table]);

  // "R" key rotates the hovered or dragged object.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') {
        const targetId = draggingRef.current ?? hoveredRef.current;
        if (targetId) {
          e.preventDefault();
          handleRotate(targetId);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleRotate]);

  const handleDragEnd = useCallback((objectId: string, pose: Pose) => {
    send({
      type: 'bwc-move-object',
      from: surfaceId,
      objectId,
      to: surfaceId,
      pose,
    });
  }, [send]);

  const handleFlip = useCallback((objectId: string) => {
    send({ type: 'bwc-flip-object', surface: surfaceId, objectId });
  }, [send]);

  const handleDelete = useCallback((objectId: string) => {
    send({ type: 'bwc-delete-object', surface: surfaceId, objectId });
  }, [send]);

  const handleBringToFront = useCallback((objectId: string) => {
    send({ type: 'bwc-bring-to-front', surface: surfaceId, objectId });
  }, [send]);

  const objects = table.visibility === 'full' ? table.objects : [];
  const sorted = [...objects].sort((a, b) => a.z - b.z);

  return (
    <div className="bwc-table" style={{ width: TABLE_SIZE, height: TABLE_SIZE }}>
      <div
        className="bwc-table-inner"
        data-rotation={rotation}
        style={{
          width: '100%',
          height: '100%',
          transform: `rotate(${rotation}deg)`,
          position: 'relative',
        }}
      >
        {sorted.map(obj => (
          <TableObjectView
            key={obj.id}
            obj={obj}
            onDragEnd={handleDragEnd}
            onFlip={handleFlip}
            onDelete={handleDelete}
            onBringToFront={handleBringToFront}
            onRotate={handleRotate}
            hoveredRef={hoveredRef}
            draggingRef={draggingRef}
          />
        ))}
        {seats.map(seat => (
          <div
            key={seat.playerId}
            className={`bwc-seat-label ${seat.connected ? '' : 'disconnected'}`}
            style={{
              ...seatLabelStyle(seat),
              // Counter-rotate the label so text reads right-side-up.
              ...(rotation !== 0 ? { transform: `${seatLabelStyle(seat).transform ?? ''} rotate(${-rotation}deg)` } : {}),
            }}
          >
            {seat.handle}
          </div>
        ))}
      </div>
    </div>
  );
}
