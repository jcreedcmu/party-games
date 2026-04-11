import { useRef, useCallback } from 'react';
import type { BwcVisibleObject, BwcVisibleSurface, BwcClientCardSummary, ClientMessage, Pose, SurfaceId } from '../../types';
import { CardView, CardBack } from './CardView';

const TABLE_SIZE = 800; // logical px
const CARD_W = 160;
const CARD_H = 120;

type TableObjectProps = {
  obj: BwcVisibleObject;
  onDragEnd: (objectId: string, pose: Pose) => void;
  onFlip: (objectId: string) => void;
  onDelete: (objectId: string) => void;
  onBringToFront: (objectId: string) => void;
};

function TableObjectView({ obj, onDragEnd, onFlip, onDelete, onBringToFront }: TableObjectProps) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    const el = elRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    onBringToFront(obj.id);
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
    // Compute scale factor: the table div's rendered size vs logical size.
    const parent = el.parentElement;
    if (!parent) return;
    const scale = parent.clientWidth / TABLE_SIZE;
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
    const scale = parent.clientWidth / TABLE_SIZE;
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
    >
      {content}
    </div>
  );
}

type Props = {
  table: BwcVisibleSurface;
  library: BwcClientCardSummary[];
  send: (msg: ClientMessage) => void;
};

export function BwcTable({ table, library, send }: Props) {
  const surfaceId: SurfaceId = { kind: 'table' };

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

  // Spawn the first available (not in-play) library card at a clicked position.
  function handleTableClick(e: React.MouseEvent<HTMLDivElement>) {
    // Only fire on direct clicks on the table background, not on objects.
    if (e.target !== e.currentTarget) return;
    // No-op for now — spawning from library panel would be better UX.
  }

  const objects = table.visibility === 'full' ? table.objects : [];
  // Sort by z for rendering order (CSS z-index handles overlap, but DOM
  // order matters for accessibility and event bubbling).
  const sorted = [...objects].sort((a, b) => a.z - b.z);

  return (
    <div className="bwc-table" onClick={handleTableClick} style={{ width: TABLE_SIZE, height: TABLE_SIZE }}>
      {sorted.map(obj => (
        <TableObjectView
          key={obj.id}
          obj={obj}
          onDragEnd={handleDragEnd}
          onFlip={handleFlip}
          onDelete={handleDelete}
          onBringToFront={handleBringToFront}
        />
      ))}
    </div>
  );
}
