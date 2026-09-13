import type { DrawOp } from './types';
import { replayOps } from './apply-ops';

export type RenderRequest = { opsHash: string; ops: DrawOp[]; w: number; h: number };
export type RenderResponse =
  | { opsHash: string; blob: Blob }
  | { opsHash: string; error: string };

// Replaying a card's ops is tens of milliseconds of tight pixel work, and
// encoding the result is more. Doing it here keeps both off the thread that
// has to stay responsive for dragging cards around the table.
self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { opsHash, ops, w, h } = e.data;
  try {
    const { imageData } = replayOps(ops, w, h, { retainSnapshots: false });
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context in worker');
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const done: RenderResponse = { opsHash, blob };
    self.postMessage(done);
  } catch (err) {
    const failed: RenderResponse = { opsHash, error: String(err) };
    self.postMessage(failed);
  }
};
