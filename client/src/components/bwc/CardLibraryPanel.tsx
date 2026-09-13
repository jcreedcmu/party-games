import { useRef, useState, useLayoutEffect } from 'react';
import type { BwcClientCardMeta, CardId } from '../../types';
import { CardView } from './CardView';
import { CARD_W, CARD_H } from '../../../../server/games/bwc/constants';
import { PRIORITY_VISIBLE, PRIORITY_BACKGROUND } from '../../card-art';

type EditHandler = (cardId: CardId, opsHash: string, name: string, cardType: string, text: string) => void;

type Props = {
  cards: BwcClientCardMeta[];
  onEdit?: EditHandler;
  // Deck curation. Present only in the waiting room, where there is a next
  // game to curate.
  excluded?: Set<CardId>;
  onSetIncluded?: (cardId: CardId, included: boolean) => void;
  onSetAllIncluded?: (included: boolean) => void;
};

function LibraryCard({ card, onEdit, included, onSetIncluded }: {
  card: BwcClientCardMeta;
  onEdit?: EditHandler;
  included?: boolean;
  onSetIncluded?: (cardId: CardId, included: boolean) => void;
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
    <div className={`bwc-library-card${included === false ? ' bwc-library-card-excluded' : ''}`} ref={containerRef}>
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
        {onSetIncluded && (
          <label className="bwc-include-toggle">
            <input
              type="checkbox"
              checked={included !== false}
              onChange={e => onSetIncluded(card.id, e.target.checked)}
            />
            In
          </label>
        )}
        {onEdit && card.editable && (
          <button className="bwc-edit-btn" onClick={() => onEdit(card.id, card.opsHash, card.name, card.cardType, card.text)}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export function CardLibraryPanel({ cards, onEdit, excluded, onSetIncluded, onSetAllIncluded }: Props) {
  if (cards.length === 0) {
    return (
      <div className="bwc-library-panel">
        <h3>Card Library</h3>
        <p className="bwc-library-empty">No cards yet. Create one!</p>
      </div>
    );
  }

  const includedCount = excluded ? cards.length - excluded.size : cards.length;

  return (
    <div className="bwc-library-panel">
      <div className="bwc-library-header">
        <h3>
          Card Library ({cards.length})
          {excluded && <span className="bwc-library-included-count"> — {includedCount} in the deck</span>}
        </h3>
        {onSetAllIncluded && (
          <div className="bwc-library-bulk">
            <button onClick={() => onSetAllIncluded(true)}>All</button>
            <button onClick={() => onSetAllIncluded(false)}>None</button>
          </div>
        )}
      </div>
      <div className="bwc-library-grid">
        {cards.map(card => (
          <LibraryCard
            key={card.id}
            card={card}
            onEdit={onEdit}
            included={excluded ? !excluded.has(card.id) : undefined}
            onSetIncluded={onSetIncluded}
          />
        ))}
      </div>
    </div>
  );
}
