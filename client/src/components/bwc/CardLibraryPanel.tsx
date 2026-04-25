import { useRef, useState, useLayoutEffect } from 'react';
import type { BwcClientCardSummary, ClientMessage, CardId, DrawOp, Side } from '../../types';
import { CardView } from './CardView';
import { CARD_W, CARD_H } from '../../../../server/games/bwc/constants';

// Card rotation in table-logical space so the card appears upright
// from the spawning player's perspective. This is the inverse of the
// screen rotation applied for that seat.
const SPAWN_ROT: Record<Side, number> = { S: 0, N: 180, E: 90, W: 270 };

type Props = {
  cards: BwcClientCardSummary[];
  canSpawn?: boolean;
  mySide?: Side;
  send?: (msg: ClientMessage) => void;
  onEdit?: (cardId: CardId, ops: DrawOp[], name: string, cardType: string, text: string) => void;
};

function LibraryCard({ card, canSpawn, send, onEdit, mySide, onSpawn }: {
  card: BwcClientCardSummary;
  canSpawn?: boolean;
  send?: (msg: ClientMessage) => void;
  onEdit?: (cardId: CardId, ops: DrawOp[], name: string, cardType: string, text: string) => void;
  mySide?: Side;
  onSpawn: (cardId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / CARD_W);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bwc-library-card" ref={containerRef}>
      <div style={{ height: CARD_H * scale }}>
        <div style={{
          width: CARD_W,
          height: CARD_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}>
          <CardView card={card} isInteractive={false} />
        </div>
      </div>
      <div className="bwc-library-card-actions">
        {canSpawn && send && (
          <button className="bwc-spawn-btn" onClick={() => onSpawn(card.id)}>
            Spawn
          </button>
        )}
        {onEdit && (
          <button className="bwc-edit-btn" onClick={() => onEdit(card.id, card.ops, card.name, card.cardType, card.text)}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export function CardLibraryPanel({ cards, canSpawn, mySide, send, onEdit }: Props) {
  function handleSpawn(cardId: string) {
    if (!send) return;
    const rot = mySide ? SPAWN_ROT[mySide] : 0;
    send({
      type: 'bwc-spawn-card',
      cardId,
      surface: { kind: 'table' },
      pose: { x: 300 + Math.random() * 200, y: 300 + Math.random() * 200, rot },
      faceUp: true,
    });
  }

  if (cards.length === 0) {
    return (
      <div className="bwc-library-panel">
        <h3>Card Library</h3>
        <p className="bwc-library-empty">No cards yet. Create one!</p>
      </div>
    );
  }

  return (
    <div className="bwc-library-panel">
      <h3>Card Library ({cards.length})</h3>
      <div className="bwc-library-grid">
        {cards.map(card => (
          <LibraryCard key={card.id} card={card} canSpawn={canSpawn} send={send} onEdit={onEdit} mySide={mySide} onSpawn={handleSpawn} />
        ))}
      </div>
    </div>
  );
}
