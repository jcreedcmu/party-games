import { useRef, useState, useLayoutEffect } from 'react';
import type { BwcClientCardSummary, CardId, DrawOp } from '../../types';
import { CardView } from './CardView';
import { CARD_W, CARD_H } from '../../../../server/games/bwc/constants';

type Props = {
  cards: BwcClientCardSummary[];
  onEdit?: (cardId: CardId, ops: DrawOp[], name: string, cardType: string, text: string) => void;
};

function LibraryCard({ card, onEdit }: {
  card: BwcClientCardSummary;
  onEdit?: (cardId: CardId, ops: DrawOp[], name: string, cardType: string, text: string) => void;
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
        {onEdit && (
          <button className="bwc-edit-btn" onClick={() => onEdit(card.id, card.ops, card.name, card.cardType, card.text)}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export function CardLibraryPanel({ cards, onEdit }: Props) {
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
          <LibraryCard key={card.id} card={card} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}
