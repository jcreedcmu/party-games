import type { BwcClientCardSummary } from '../../types';
import { LiveCanvas } from '../pictionary/LiveCanvas';

type Props = {
  cards: BwcClientCardSummary[];
};

export function CardLibraryPanel({ cards }: Props) {
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
          <div key={card.id} className="bwc-library-card">
            <div className="bwc-library-card-preview">
              <LiveCanvas ops={card.ops} />
            </div>
            <div className="bwc-library-card-info">
              <div className="bwc-library-card-text">{card.text || '(no text)'}</div>
              <div className="bwc-library-card-creator">by {card.creatorHandle}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
