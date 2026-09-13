// jsdom provides neither `ImageData` nor a working 2D canvas context, both
// of which the drawing pipeline needs: `ImageData` everywhere, and a 1x1
// context inside `parseColor`. These install just enough of each for the
// pipeline to run for real, so tests exercise the actual pixel code rather
// than a mock of it.

class StubImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: PredefinedColorSpace = 'srgb';

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height ?? 1;
    }
  }
}

// Parse the color notations the drawing toolbar can produce: #rgb and
// #rrggbb. Anything else reads as black, as an unparseable fillStyle would.
function parseHex(color: string): [number, number, number] {
  const short = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) {
    return [0, 1, 2].map(i => parseInt(short[i + 1].repeat(2), 16)) as [number, number, number];
  }
  const long = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (long) {
    return [0, 1, 2].map(i => parseInt(long[i + 1], 16)) as [number, number, number];
  }
  return [0, 0, 0];
}

// Supports only the 1x1 fillStyle / fillRect / getImageData sequence that
// `parseColor` performs.
function makeStubContext() {
  let rgb: [number, number, number] = [0, 0, 0];
  return {
    set fillStyle(color: string) { rgb = parseHex(color); },
    get fillStyle(): string { return `rgb(${rgb.join(',')})`; },
    fillRect() { /* the color is all `getImageData` below reports */ },
    getImageData(_x: number, _y: number, w: number, h: number) {
      const img = new StubImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
      return img;
    },
  };
}

export function installCanvasStubs(): void {
  // Casting once here is the containment boundary: these are DOM globals
  // that jsdom leaves unimplemented, so there is no typed way to install them.
  const g = globalThis as unknown as { ImageData?: typeof ImageData };
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = StubImageData as unknown as typeof ImageData;
  }
  HTMLCanvasElement.prototype.getContext =
    function (contextId: string) {
      return contextId === '2d' ? makeStubContext() : null;
    } as unknown as HTMLCanvasElement['getContext'];
}
