import { useEffect, useRef, useState } from 'react';
import type { Point } from '../../../../util/types';
import './PieMenu.css';

export type PieMenuItem = {
  label: string;
  action: () => void;
};

type Props = {
  position: Point;       // container-relative, for CSS positioning
  clientCenter: Point;   // viewport coords, for gesture hit-testing
  items: PieMenuItem[];
  onClose: () => void;
  gesture: boolean;      // true = opened via right-button-down, track drag to select
};

export const INNER_R = 25;
export const OUTER_R = 75;
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

// Given a point relative to the pie center, return the index of the slice it falls in,
// or null if inside the inner dead zone.
function hitTest(dx: number, dy: number, n: number, baseAngle: number, step: number): number | null {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < INNER_R) return null;
  const angle = Math.atan2(dy, dx);
  // Normalize angle relative to baseAngle into [0, 2π).
  const rel = ((angle - baseAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return Math.floor(rel / step);
}

export function PieMenu({ position, clientCenter, items, onClose, gesture }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [gestureIndex, setGestureIndex] = useState<number | null>(null);

  // Close on outside pointerdown (click mode).
  useEffect(() => {
    if (gesture) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose, gesture]);

  const n = items.length;
  const step = (2 * Math.PI) / n;
  const baseAngle = -Math.PI / 2 - step / 2;

  // Gesture mode: track mouse movement and select on right-button release.
  useEffect(() => {
    if (!gesture) return;
    function handleMouseMove(e: MouseEvent) {
      const dx = e.clientX - clientCenter.x;
      const dy = e.clientY - clientCenter.y;
      setGestureIndex(hitTest(dx, dy, n, baseAngle, step));
    }
    function handleMouseUp(e: MouseEvent) {
      if (e.button !== 2) return;
      const dx = e.clientX - clientCenter.x;
      const dy = e.clientY - clientCenter.y;
      const idx = hitTest(dx, dy, n, baseAngle, step);
      if (idx != null) {
        items[idx].action();
      }
      onClose();
    }
    function handleContextMenu(e: Event) {
      e.preventDefault();
    }
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [gesture, clientCenter, items, onClose, n, baseAngle, step]);

  // position is in client coords for gesture mode, container-relative otherwise.
  // The SVG is positioned relative to the pie-menu div, which is absolutely positioned.

  const SVG_SIZE = (OUTER_R + 4) * 2;
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

          const midR = (INNER_R + OUTER_R) / 2;
          const lx = Math.cos(centerAngle) * midR;
          const ly = Math.sin(centerAngle) * midR;

          const active = gesture && gestureIndex === i;

          return (
            <g
              key={item.label}
              className={`pie-slice${active ? ' pie-slice-active' : ''}`}
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
