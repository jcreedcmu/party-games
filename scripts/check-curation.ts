// Drives the waiting-room curation UI against a running bwc server and
// reports what the deck would be. Read-only with respect to the card
// library; it never saves a card.
// Run: npx tsx scripts/check-curation.ts <port>
import { firefox } from '@playwright/test';

const port = process.argv[2] ?? '3462';
const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

const errors: string[] = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(`http://localhost:${port}/`);
await page.getByPlaceholder('Your name').fill('Alice');
await page.getByPlaceholder('Game password').fill('secret');
await page.getByRole('button', { name: 'Join' }).click();

const cards = page.locator('.bwc-library-card');
await cards.first().waitFor({ timeout: 15_000 });
const listed = await cards.count();
const heading = page.locator('.bwc-library-panel h3');
console.log(`listed: ${listed} cards (blanks excluded) — "${(await heading.innerText()).replace(/\n/g, ' ')}"`);

const boxes = page.locator('.bwc-include-toggle input');
console.log(`checkboxes: ${await boxes.count()}, all checked = ${await boxes.first().isChecked()}`);

await boxes.nth(0).click();
await page.waitForTimeout(400);
console.log(`after one click: first box checked = ${await boxes.first().isChecked()}, ` +
  `heading "${(await heading.innerText()).replace(/\n/g, ' ')}", ` +
  `dimmed = ${await page.locator('.bwc-library-card-excluded').count()}`);

await page.getByRole('button', { name: 'None' }).click();
await page.waitForTimeout(200);
console.log(`after None: "${(await heading.innerText()).replace(/\n/g, ' ')}"`);

await page.getByRole('button', { name: 'All' }).click();
await page.waitForTimeout(200);
console.log(`after All: "${(await heading.innerText()).replace(/\n/g, ' ')}"`);

console.log(errors.length ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');
await browser.close();
