// Drives a real browser against a bwc server and reports how the card art
// pipeline behaves: how long until art appears, and whether every library
// card ends up with an image.
// Run: npx tsx scripts/check-card-art-browser.ts <port>
import { firefox } from '@playwright/test';

const port = process.argv[2] ?? '3458';
const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

const errors: string[] = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

// A card whose art came out of the persistent store needs neither its ops
// nor a render, so counting ops requests measures the store directly.
let opsRequests = 0;
page.on('request', r => { if (r.url().includes('/api/bwc/card/')) opsRequests++; });

const t0 = Date.now();
await page.goto(`http://localhost:${port}/`);
await page.getByPlaceholder('Your name').fill('Alice');
await page.getByPlaceholder('Game password').fill('secret');
await page.getByRole('button', { name: 'Join' }).click();

const cards = page.locator('.bwc-library-card');
await cards.first().waitFor({ timeout: 15_000 });
const total = await cards.count();
console.log(`library rendered: ${total} cards, ${Date.now() - t0} ms after page load`);

const firstArt = page.locator('img.bwc-card-canvas').first();
await firstArt.waitFor({ timeout: 15_000 });
console.log(`first card art visible: ${Date.now() - t0} ms after page load`);

// Give the queue time to drain the whole library.
await page.locator('img.bwc-card-canvas').nth(total - 1).waitFor({ timeout: 60_000 });
const imgs = await page.locator('img.bwc-card-canvas').count();
const srcs = await page.locator('img.bwc-card-canvas').evaluateAll(
  els => els.map(el => (el as HTMLImageElement).src.slice(0, 5)),
);
const decoded = await page.locator('img.bwc-card-canvas').evaluateAll(
  els => els.filter(el => (el as HTMLImageElement).naturalWidth > 0).length,
);
console.log(`all art rendered: ${imgs}/${total} images, ${Date.now() - t0} ms after page load`);
console.log(`sources: ${[...new Set(srcs)].join(', ')}; decoded with pixels: ${decoded}`);
// The editor no longer receives ops through props; it fetches them by hash.
// Only the read path is exercised here, so the stored library is untouched.
await cards.first().getByRole('button', { name: 'Edit' }).click();
const editorCanvas = page.locator('.bwc-card-editor canvas').first();
await editorCanvas.waitFor({ timeout: 15_000 });
const painted = await editorCanvas.evaluate(el => {
  const c = el as HTMLCanvasElement;
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < d.length; i++) if (d[i] !== 255) return true;
  return false;
});
console.log(`editor loaded art by hash: canvas non-blank = ${painted}`);
await page.getByRole('button', { name: 'Cancel' }).click();
console.log(`cold load fetched ops for ${opsRequests} cards`);

// Reload: everything should come back out of the art store.
opsRequests = 0;
const t1 = Date.now();
await page.reload();
await page.getByPlaceholder('Your name').fill('Alice');
await page.getByPlaceholder('Game password').fill('secret');
await page.getByRole('button', { name: 'Join' }).click();
await page.locator('img.bwc-card-canvas').nth(total - 1).waitFor({ timeout: 60_000 });
const warmDecoded = await page.locator('img.bwc-card-canvas').evaluateAll(
  els => els.filter(el => (el as HTMLImageElement).naturalWidth > 0).length,
);
console.log(`warm reload: all art rendered in ${Date.now() - t1} ms, ${warmDecoded}/${total} decoded, ${opsRequests} ops fetches`);

console.log(errors.length ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');

await browser.close();
