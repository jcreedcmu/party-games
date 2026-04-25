import { useRef } from 'react';
import type { BwcClientCardFull } from '../../types';
import { getImageUrl } from '../../image-cache';

function ScoreChip({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);

    const floating = document.createElement('div');
    floating.textContent = value;
    floating.className = 'bwc-score-chip bwc-score-chip-floating';
    floating.style.left = `${e.clientX}px`;
    floating.style.top = `${e.clientY}px`;
    document.body.appendChild(floating);
    floatingRef.current = floating;
  }

  function handlePointerMove(e: React.PointerEvent) {
    const floating = floatingRef.current;
    if (!floating) return;
    floating.style.left = `${e.clientX}px`;
    floating.style.top = `${e.clientY}px`;

    // Hit-test under the floating chip.
    floating.style.display = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    floating.style.display = '';
    const target = el?.closest('[data-bwc-score-target]');
    document.querySelectorAll('.bwc-drop-hover').forEach(n => n.classList.remove('bwc-drop-hover'));
    if (target) target.classList.add('bwc-drop-hover');
  }

  function handlePointerUp(e: React.PointerEvent) {
    const floating = floatingRef.current;
    if (!floating) return;
    floating.style.display = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    floating.remove();
    floatingRef.current = null;

    document.querySelectorAll('.bwc-drop-hover').forEach(n => n.classList.remove('bwc-drop-hover'));

    const target = el?.closest('[data-bwc-score-target]');
    if (target) {
      const playerId = target.getAttribute('data-bwc-score-target')!;
      const delta = parseInt(value, 10);
      target.dispatchEvent(new CustomEvent('bwc-score-drop', {
        bubbles: true,
        detail: { playerId, delta },
      }));
    }
  }

  return (
    <span
      ref={ref}
      className="bwc-score-chip"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {value}
    </span>
  );
}

// Parse rules text, turning "+N" / "-N" tokens into draggable score chips.
function RulesText({ text }: { text: string }) {
  const parts = text.split(/([+-]\d+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^[+-]\d+$/.test(part)
          ? <ScoreChip key={i} value={part} />
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

type Props = {
  card: BwcClientCardFull;
};

export function CardView({ card }: Props) {
  const src = getImageUrl(card.opsHash, card.ops, 800, 600);
  return (
    <div className="bwc-card-face">
      <div className="bwc-card-name">{card.name}</div>
      <div className="bwc-card-art">
        <img src={src} className="bwc-card-canvas" draggable={false} />
      </div>
      <div className="bwc-card-type">{card.cardType}</div>
      <div className="bwc-card-rules"><RulesText text={card.text} /></div>
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

export function CardFaceBlank() {
  return <div className="bwc-card-face" />;
}
