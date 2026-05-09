import { describe, it, expect } from 'vitest';

// jsdom doesn't provide ImageData — polyfill before importing modules that use it.
if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: string;
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height!;
      }
      this.colorSpace = 'srgb';
    }
  };
}

import { getOrReplay } from '../image-cache';
import type { DrawOp } from '../types';

const W = 10;
const H = 10;

// "Blank" means all-white (255,255,255,255) — that's what clearImageData sets.
function isBlank(imageData: ImageData): boolean {
  return imageData.data.every(v => v === 255);
}

describe('getOrReplay with empty-string key (pictionary relay bug)', () => {
  // Reproduces the bug from d6fc892: in pictionary, LiveCanvas receives
  // streamed draw ops without an opsHash. Its applyAllOps() calls
  // getOrReplay('', ops, ...) on every render. The first render has ops=[],
  // which caches a blank image under key ''. All later renders — with
  // growing ops arrays — still hit that same '' cache entry and return the
  // stale blank image, so guessers never see the drawer's strokes.
  //
  // This simulates the lifecycle: initial empty render, then three
  // incremental relay batches as the drawer draws a stroke.

  it('should not return stale results when ops grow under the same empty key', () => {
    // Initial render: no ops yet, canvas should be blank.
    const result0 = getOrReplay('', [], W, H);
    expect(isBlank(result0)).toBe(true);

    // Drawer starts a stroke — relay delivers draw-start.
    const ops1: DrawOp[] = [
      { type: 'draw-start', color: '#ff0000', size: 5, x: 0, y: 0 },
    ];
    const result1 = getOrReplay('', ops1, W, H);
    expect(isBlank(result1)).toBe(false);

    // Drawer moves — relay delivers draw-move, ops list grows.
    const ops2: DrawOp[] = [...ops1, { type: 'draw-move', x: 5, y: 5 }];
    const result2 = getOrReplay('', ops2, W, H);
    expect(isBlank(result2)).toBe(false);

    // Drawer finishes stroke — relay delivers draw-end.
    const ops3: DrawOp[] = [...ops2, { type: 'draw-end' }];
    const result3 = getOrReplay('', ops3, W, H);
    expect(isBlank(result3)).toBe(false);
  });
});
