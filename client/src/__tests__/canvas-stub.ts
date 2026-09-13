// jsdom does not provide `ImageData`, which the drawing pipeline uses
// everywhere. This installs just enough of it for the pipeline to run for
// real, so tests exercise the actual pixel code rather than a mock of it.

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

export function installCanvasStubs(): void {
  // Casting once here is the containment boundary: `ImageData` is a DOM
  // global that jsdom leaves unimplemented, so there is no typed way to
  // install it.
  const g = globalThis as unknown as { ImageData?: typeof ImageData };
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = StubImageData as unknown as typeof ImageData;
  }
}
