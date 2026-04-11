import { useRef, useCallback } from 'react';
import type { BwcVisibleObject, BwcVisibleSurface, ClientMessage, Pose, SurfaceId, Side } from '../../types';
import { CardView, CardBack } from './CardView';

const TRAY_W = 800;
const TRAY_H = 200;

const SIDE_ROTATION: Record<Side, number> = { S: 0, E: 90, N: 180, W: 270 };

type HandObjectProps = {
  obj: BwcVisibleObject;
  onDragEnd: (objectId: string, pose: Pose) => void;
  onFlip: (objectId: string) => void;
  onToTable: (objectId: string) => void;
  hoveredRef: React.MutableRefObject<string | null>;
};

function HandObjectView({ obj, onDragEnd, onFlip, onToTable, hoveredRef }: HandObjectProps) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    const el = elRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
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
    const parent = el.parentElement;
    if (!parent) return;
    const scale = parent.clientWidth / TRAY_W;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    el.style.left = `${drag.origX + dx}px`;
    el.style.top = `${drag.origY + dy}px`;
  }

  function handlePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const el = elRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const scale = parent.clientWidth / TRAY_W;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    onDragEnd(obj.id, { x: drag.origX + dx, y: drag.origY + dy, rot: obj.pose.rot });
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onFlip(obj.id);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToTable(obj.id);
  }

  const content = obj.kind === 'card'
    ? (obj.faceUp && obj.card ? <CardView card={obj.card} /> : <CardBack />)
    : <CardBack />;

  return (
    <div
      ref={elRef}
      className="bwc-table-object"
      style={{
        left: obj.pose.x,
        top: obj.pose.y,
        zIndex: obj.z,
        width: 120,
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

type Props = {
  hand: BwcVisibleSurface;
  playerId: string;
  mySide: Side;
  send: (msg: ClientMessage) => void;
};

export function HandTray({ hand, playerId, mySide, send }: Props) {
  const surfaceId: SurfaceId = { kind: 'hand', ownerId: playerId };
  const handHoveredRef = useRef<string | null>(null);

  const handleDragEnd = useCallback((objectId: string, pose: Pose) => {
    send({
      type: 'bwc-move-object',
      from: surfaceId,
      objectId,
      to: surfaceId,
      pose,
    });
  }, [send, playerId]);

  const handleFlip = useCallback((objectId: string) => {
    send({ type: 'bwc-flip-object', surface: surfaceId, objectId });
  }, [send, playerId]);

  // Right-click a card in hand → put it on the table near my seat.
  const handleToTable = useCallback((objectId: string) => {
    const rot = SIDE_ROTATION[mySide];
    send({
      type: 'bwc-move-object',
      from: surfaceId,
      objectId,
      to: { kind: 'table' },
      pose: { x: 350 + Math.random() * 100, y: 350 + Math.random() * 100, rot },
    });
  }, [send, playerId, mySide]);

  const objects = hand.visibility === 'full' ? hand.objects : [];
  const sorted = [...objects].sort((a, b) => a.z - b.z);

  return (
    <div className="bwc-hand-tray" style={{ width: TRAY_W, height: TRAY_H }}>
      <div className="bwc-hand-label">Your Hand ({objects.length})</div>
      {sorted.map(obj => (
        <HandObjectView
          key={obj.id}
          obj={obj}
          onDragEnd={handleDragEnd}
          onFlip={handleFlip}
          onToTable={handleToTable}
          hoveredRef={handHoveredRef}
        />
      ))}
    </div>
  );
}
