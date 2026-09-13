import { useRef, useState, useLayoutEffect } from 'react';
import type { BwcClientCardMeta, CardId } from '../../types';
import { CardView } from './CardView';
import { CARD_W, CARD_H } from '../../../../server/games/bwc/constants';
import { PRIORITY_VISIBLE, PRIORITY_BACKGROUND } from '../../card-art';

type Props = {
  cards: BwcClientCardMeta[];
  onEdit?: (cardId: CardId, opsHash: string, name: string, cardType: string, text: string) => void;
};

function LibraryCard({ card, onEdit }: {
  card: BwcClientCardMeta;
  onEdit?: (cardId: CardId, opsHash: string, name: string, cardType: string, text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [onScreen, setOnScreen] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / CARD_W);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Every card in the panel is queued, so the whole library renders in the
  // background; the ones actually scrolled into view jump the queue.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
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
          <CardView
            card={card}
            isInteractive={false}
            artPriority={onScreen ? PRIORITY_VISIBLE : PRIORITY_BACKGROUND}
          />
        </div>
      </div>
      <div className="bwc-library-card-actions">
        {onEdit && card.editable && (
          <button className="bwc-edit-btn" onClick={() => onEdit(card.id, card.opsHash, card.name, card.cardType, card.text)}>
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
