import type { BwcClientCardFull } from '../../types';
import { LiveCanvas } from '../pictionary/LiveCanvas';

type Props = {
  card: BwcClientCardFull;
};

export function CardView({ card }: Props) {
  return (
    <div className="bwc-card-face">
      <div className="bwc-card-art">
        <LiveCanvas ops={card.ops} />
      </div>
      {card.text && (
        <div className="bwc-card-text-overlay">{card.text}</div>
      )}
    </div>
  );
}

export function CardBack() {
  return (
    <div className="bwc-card-face bwc-card-back">
      <div className="bwc-card-back-pattern" />
    </div>
  );
}
