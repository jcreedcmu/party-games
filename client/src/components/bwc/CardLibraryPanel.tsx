import type { BwcClientCardSummary, ClientMessage } from '../../types';
import { LiveCanvas } from '../pictionary/LiveCanvas';

type Props = {
  cards: BwcClientCardSummary[];
  canSpawn?: boolean;
  send?: (msg: ClientMessage) => void;
};

export function CardLibraryPanel({ cards, canSpawn, send }: Props) {
  function handleSpawn(cardId: string) {
    if (!send) return;
    // Spawn near center of table, face up.
    send({
      type: 'bwc-spawn-card',
      cardId,
      surface: { kind: 'table' },
      pose: { x: 300 + Math.random() * 200, y: 300 + Math.random() * 200, rot: 0 },
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
          <div key={card.id} className="bwc-library-card">
            <div className="bwc-library-card-preview">
              <LiveCanvas ops={card.ops} />
            </div>
            <div className="bwc-library-card-info">
              <div className="bwc-library-card-text">{card.text || '(no text)'}</div>
              <div className="bwc-library-card-creator">by {card.creatorHandle}</div>
              {canSpawn && send && (
                <button className="bwc-spawn-btn" onClick={() => handleSpawn(card.id)}>
                  Spawn
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
