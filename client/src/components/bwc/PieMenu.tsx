import { useEffect, useRef } from 'react';
import type { Point } from '../../../../util/types';
import './PieMenu.css';

export type PieMenuItem = {
  label: string;
  action: () => void;
};

type Props = {
  position: Point;
  items: PieMenuItem[];
  onClose: () => void;
};

const INNER_R = 25;
const OUTER_R = 75;
const GAP = 3; // pixels — constant-width gap between slices

function slicePath(centerAngle: number, halfStep: number): string {
  // Angular inset = GAP / (2 * radius) so that arc-length = GAP/2 at every radius,
  // giving a constant pixel-width gap between adjacent slices.
  const innerInset = GAP / (2 * INNER_R);
  const outerInset = GAP / (2 * OUTER_R);

  const innerStart = centerAngle - halfStep + innerInset;
  const innerEnd = centerAngle + halfStep - innerInset;
  const outerStart = centerAngle - halfStep + outerInset;
  const outerEnd = centerAngle + halfStep - outerInset;

  const ix0 = Math.cos(innerStart) * INNER_R;
  const iy0 = Math.sin(innerStart) * INNER_R;
  const ox0 = Math.cos(outerStart) * OUTER_R;
  const oy0 = Math.sin(outerStart) * OUTER_R;
  const ox1 = Math.cos(outerEnd) * OUTER_R;
  const oy1 = Math.sin(outerEnd) * OUTER_R;
  const ix1 = Math.cos(innerEnd) * INNER_R;
  const iy1 = Math.sin(innerEnd) * INNER_R;

  const innerSweep = innerEnd - innerStart;
  const outerSweep = outerEnd - outerStart;
  const innerLargeArc = innerSweep > Math.PI ? 1 : 0;
  const outerLargeArc = outerSweep > Math.PI ? 1 : 0;

  return [
    `M ${ix0} ${iy0}`,
    `L ${ox0} ${oy0}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${outerLargeArc} 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${INNER_R} ${INNER_R} 0 ${innerLargeArc} 0 ${ix0} ${iy0}`,
    'Z',
  ].join(' ');
}

export function PieMenu({ position, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  const n = items.length;
  const step = (2 * Math.PI) / n;
  // Start from the top (-PI/2), centering the first slice on top.
  const baseAngle = -Math.PI / 2 - step / 2;

  const SVG_SIZE = (OUTER_R + 4) * 2; // a little padding for hover scale
  const half = SVG_SIZE / 2;

  return (
    <div
      ref={menuRef}
      className="pie-menu"
      style={{ left: position.x, top: position.y }}
    >
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`${-half} ${-half} ${SVG_SIZE} ${SVG_SIZE}`}
        style={{ position: 'absolute', left: -half, top: -half }}
      >
        {items.map((item, i) => {
          const centerAngle = baseAngle + (i + 0.5) * step;
          const d = slicePath(centerAngle, step / 2);

          // Label position: midpoint angle, midpoint radius.
          const midR = (INNER_R + OUTER_R) / 2;
          const lx = Math.cos(centerAngle) * midR;
          const ly = Math.sin(centerAngle) * midR;

          return (
            <g
              key={item.label}
              className="pie-slice"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { item.action(); onClose(); }}
            >
              <path d={d} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
