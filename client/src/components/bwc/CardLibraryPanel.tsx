import type { BwcClientCardSummary, ClientMessage, CardId, DrawOp, Side } from '../../types';
import { LiveCanvas } from '../pictionary/LiveCanvas';

// Card rotation in table-logical space so the card appears upright
// from the spawning player's perspective. This is the inverse of the
// screen rotation applied for that seat.
const SPAWN_ROT: Record<Side, number> = { S: 0, N: 180, E: 90, W: 270 };

type Props = {
  cards: BwcClientCardSummary[];
  canSpawn?: boolean;
  mySide?: Side;
  send?: (msg: ClientMessage) => void;
  onEdit?: (cardId: CardId, ops: DrawOp[], text: string) => void;
};

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
          <div key={card.id} className="bwc-library-card">
            <div className="bwc-library-card-preview">
              <LiveCanvas ops={card.ops} />
            </div>
            <div className="bwc-library-card-info">
              <div className="bwc-library-card-text">{card.text || '(no text)'}</div>
              <div className="bwc-library-card-creator">by {card.creatorHandle}</div>
              <div className="bwc-library-card-actions">
                {canSpawn && send && (
                  <button className="bwc-spawn-btn" onClick={() => handleSpawn(card.id)}>
                    Spawn
                  </button>
                )}
                {onEdit && (
                  <button className="bwc-edit-btn" onClick={() => onEdit(card.id, card.ops, card.text)}>
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
