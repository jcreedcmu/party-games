import type { BwcClientCardFull } from '../../types';
import { LiveCanvas } from '../pictionary/LiveCanvas';

type Props = {
  card: BwcClientCardFull;
};

export function CardView({ card }: Props) {
  return (
    <div className="bwc-card-face">
      <div className="bwc-card-name">{card.name}</div>
      <div className="bwc-card-art">
        <LiveCanvas ops={card.ops} canvasWidth={800} canvasHeight={600} />
      </div>
      <div className="bwc-card-type">{card.cardType}</div>
      <div className="bwc-card-rules">{card.text}</div>
      <div className="bwc-card-author">{card.creatorHandle}</div>
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
