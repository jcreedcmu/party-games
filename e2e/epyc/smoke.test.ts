import { test } from '../fixtures';
import { type Page, expect } from '@playwright/test';

/** Submit the current round for a player, whether it's text or drawing. */
async function submitRound(page: Page, text?: string) {
  const textInput = page.getByPlaceholder('Describe what you see...');
  const isTextRound = await textInput.isVisible().catch(() => false);
  if (isTextRound) {
    await textInput.fill(text ?? 'test');
  }
  // Drawing rounds just need the Submit click (submits blank canvas)
  await page.getByRole('button', { name: 'Submit' }).click();
}

test('single player can join and see waiting room', async ({ createPlayerPage }) => {
  const page = await createPlayerPage('Alice');
  await expect(page.getByTestId('waiting-room')).toBeVisible();
  await expect(page.locator('.player-name')).toContainText('Alice');
});

test('wrong password shows error', async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL!);
  await page.getByPlaceholder('Your name').fill('Alice');
  await page.getByPlaceholder('Game password').fill('wrong');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('Wrong password')).toBeVisible();
  await context.close();
});

test('two players join and ready up to start game', async ({ createPlayerPage }) => {
  const alice = await createPlayerPage('Alice');
  const bob = await createPlayerPage('Bob');

  await expect(alice.locator('.player-list')).toContainText('Bob');
  await expect(bob.locator('.player-list')).toContainText('Alice');

  await alice.getByRole('button', { name: 'Ready' }).click();
  await bob.getByRole('button', { name: 'Ready' }).click();

  await expect(alice.getByTestId('game-board')).toBeVisible();
  await expect(bob.getByTestId('game-board')).toBeVisible();
});

test('full EPYC game: two players, two rounds', async ({ createPlayerPage }) => {
  const alice = await createPlayerPage('Alice');
  const bob = await createPlayerPage('Bob');

  await alice.getByRole('button', { name: 'Ready' }).click();
  await bob.getByRole('button', { name: 'Ready' }).click();

  await expect(alice.getByTestId('game-board')).toBeVisible();
  await expect(bob.getByTestId('game-board')).toBeVisible();

  // Round 1: could be text or drawing depending on random seed
  await submitRound(alice, 'A happy cat');
  await submitRound(bob, 'A sad dog');

  // Round 2: the opposite type — just submit
  await expect(alice.getByTestId('game-board')).toBeVisible();
  await submitRound(alice);
  await submitRound(bob);

  // Should reach postgame
  await expect(alice.getByTestId('postgame')).toBeVisible();
  await expect(bob.getByTestId('postgame')).toBeVisible();
});

test('EPYC postgame reset returns to waiting room', async ({ createPlayerPage }) => {
  const alice = await createPlayerPage('Alice');
  const bob = await createPlayerPage('Bob');

  await alice.getByRole('button', { name: 'Ready' }).click();
  await bob.getByRole('button', { name: 'Ready' }).click();
  await expect(alice.getByTestId('game-board')).toBeVisible();

  // Submit through both rounds (handles text or drawing)
  await submitRound(alice, 'test');
  await submitRound(bob, 'test');

  await expect(alice.getByTestId('game-board')).toBeVisible();
  await submitRound(alice);
  await submitRound(bob);

  await expect(alice.getByTestId('postgame')).toBeVisible();

  // Click New Game
  await alice.getByRole('button', { name: 'New Game' }).click();

  // Both should return to waiting room
  await expect(alice.getByTestId('waiting-room')).toBeVisible();
  await expect(bob.getByTestId('waiting-room')).toBeVisible();
});
