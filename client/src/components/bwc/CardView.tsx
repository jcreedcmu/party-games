import { useRef } from 'react';
import type { BwcClientCardFull } from '../../types';
import { getImageUrl } from '../../image-cache';

function ScoreChip({ value, interactive }: { value: string; interactive: boolean }) {
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
      className={`bwc-score-chip${interactive ? ' bwc-score-chip-dynamic' : ''}`}
      {...(interactive ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
      } : {})}
    >
      {value}
    </span>
  );
}

// Parse rules text, turning "+N" / "-N" tokens into draggable score chips.
function RulesText({ text, interactive }: { text: string; interactive: boolean }) {
  const parts = text.split(/([+-]\d+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^[+-]\d+$/.test(part)
          ? <ScoreChip key={i} value={part} interactive={interactive} />
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

// The rules box at native card size (100×140) is ~80px wide and ~48px tall.
// Base font is 20px with line-height 1.3 (26px per line).
const RULES_BOX_W = 80;
const RULES_BOX_H = 48;
const BASE_FONT_SIZE = 20;
const LINE_HEIGHT = 1.3;

let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) {
    const c = document.createElement('canvas');
    _measureCtx = c.getContext('2d')!;
  }
  return _measureCtx;
}

function computeRulesFontSize(text: string): number {
  if (text.length === 0) return BASE_FONT_SIZE;
  const ctx = getMeasureCtx();
  // Binary search for largest font size that fits
  let lo = 4, hi = BASE_FONT_SIZE;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (textFits(ctx, text, mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.floor(lo);
}

function textFits(ctx: CanvasRenderingContext2D, text: string, fontSize: number): boolean {
  ctx.font = `${fontSize}px sans-serif`;
  const lineH = fontSize * LINE_HEIGHT;
  const maxLines = Math.floor(RULES_BOX_H / lineH);
  if (maxLines < 1) return false;

  // Word-wrap and count lines
  const words = text.split(/\s+/);
  let lines = 1;
  let lineW = 0;
  for (const word of words) {
    const ww = ctx.measureText(word).width;
    if (lineW === 0) {
      lineW = ww;
    } else {
      const spaceW = ctx.measureText(' ').width;
      if (lineW + spaceW + ww > RULES_BOX_W) {
        lines++;
        if (lines > maxLines) return false;
        lineW = ww;
      } else {
        lineW += spaceW + ww;
      }
    }
  }
  return true;
}

type Props = {
  card: BwcClientCardFull;
  isInteractive?: boolean;
};

export function CardView({ card, isInteractive = true }: Props) {
  const src = getImageUrl(card.opsHash, card.ops, 800, 600);
  return (
    <div className="bwc-card-face">
      <div className="bwc-card-name">{card.name}</div>
      <div className="bwc-card-art">
        <img src={src} className="bwc-card-canvas" draggable={false} />
      </div>
      <div className="bwc-card-type">{card.cardType}</div>
      <div className="bwc-card-rules" style={{ fontSize: computeRulesFontSize(card.text) }}><RulesText text={card.text} interactive={isInteractive} /></div>
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
