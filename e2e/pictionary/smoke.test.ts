import { test } from '../fixtures';
import { expect } from '@playwright/test';

test('single player can join pictionary waiting room', async ({ createPlayerPage }) => {
  const page = await createPlayerPage('Alice');
  await expect(page.getByTestId('waiting-room')).toBeVisible();
  await expect(page.locator('.player-list')).toContainText('Alice');
  // Pictionary waiting room has the "Add a Word" section
  await expect(page.getByText('Add a Word')).toBeVisible();
});

test('two players join, ready up, drawer picks word and draws', async ({ createPlayerPage }) => {
  const alice = await createPlayerPage('Alice');
  const bob = await createPlayerPage('Bob');

  await alice.getByRole('button', { name: 'Ready' }).click();
  await bob.getByRole('button', { name: 'Ready' }).click();

  // One player should be the drawer (word picker), the other should be waiting
  const aliceIsDrawer = await alice.getByTestId('word-picker').isVisible().catch(() => false);
  const drawer = aliceIsDrawer ? alice : bob;
  const guesser = aliceIsDrawer ? bob : alice;

  // Guesser should see "picking a word" message
  await expect(guesser.getByTestId('picking-wait')).toBeVisible();

  // Drawer picks the first word
  await drawer.locator('.pic-word-choice-btn').first().click();

  // Drawer should now see the drawing view
  await expect(drawer.getByTestId('drawer-view')).toBeVisible();
  // Guesser should see the guessing view
  await expect(guesser.getByTestId('guesser-view')).toBeVisible();
});

test('guesser can submit a guess', async ({ createPlayerPage }) => {
  const alice = await createPlayerPage('Alice');
  const bob = await createPlayerPage('Bob');

  await alice.getByRole('button', { name: 'Ready' }).click();
  await bob.getByRole('button', { name: 'Ready' }).click();

  const aliceIsDrawer = await alice.getByTestId('word-picker').isVisible().catch(() => false);
  const drawer = aliceIsDrawer ? alice : bob;
  const guesser = aliceIsDrawer ? bob : alice;

  // Drawer picks word
  await drawer.locator('.pic-word-choice-btn').first().click();
  await expect(guesser.getByTestId('guesser-view')).toBeVisible();

  // Guesser submits a guess
  await guesser.getByPlaceholder('Type your guess...').fill('something');
  await guesser.getByRole('button', { name: 'Guess' }).click();

  // The guess should appear in the guess feed for both players
  await expect(guesser.getByText('something')).toBeVisible();
  await expect(drawer.getByText('something')).toBeVisible();
});

test('correct guess shows feedback and advances turn', async ({ createPlayerPage }) => {
  const alice = await createPlayerPage('Alice');
  const bob = await createPlayerPage('Bob');

  await alice.getByRole('button', { name: 'Ready' }).click();
  await bob.getByRole('button', { name: 'Ready' }).click();

  const aliceIsDrawer = await alice.getByTestId('word-picker').isVisible().catch(() => false);
  const drawer = aliceIsDrawer ? alice : bob;
  const guesser = aliceIsDrawer ? bob : alice;

  // Drawer picks a word — read the secret word from the drawer's view
  const wordButton = drawer.locator('.pic-word-choice-btn').first();
  const secretWord = await wordButton.textContent();
  await wordButton.click();

  await expect(drawer.getByTestId('drawer-view')).toBeVisible();
  await expect(guesser.getByTestId('guesser-view')).toBeVisible();

  // Guesser guesses the correct word
  await guesser.getByPlaceholder('Type your guess...').fill(secretWord!);
  await guesser.getByRole('button', { name: 'Guess' }).click();

  // Guesser should see "You guessed it!"
  await expect(guesser.getByText('You guessed it!')).toBeVisible();
  // Drawer should see "guessed correctly"
  await expect(drawer.getByText('guessed correctly')).toBeVisible();

  // Drawer clicks Done to advance
  await drawer.getByRole('button', { name: 'Done' }).click();

  // Turn 2: roles should swap — the previous guesser is now drawer
  // The new drawer should see word picker or drawer view
  const newDrawerHasWordPicker = await guesser.getByTestId('word-picker').isVisible().catch(() => false);
  const newDrawerHasDrawerView = await guesser.getByTestId('drawer-view').isVisible().catch(() => false);
  expect(newDrawerHasWordPicker || newDrawerHasDrawerView).toBe(true);
});

test('full two-turn pictionary game reaches postgame', async ({ createPlayerPage }) => {
  const alice = await createPlayerPage('Alice');
  const bob = await createPlayerPage('Bob');

  await alice.getByRole('button', { name: 'Ready' }).click();
  await bob.getByRole('button', { name: 'Ready' }).click();

  // --- Turn 1 ---
  const aliceIsDrawer = await alice.getByTestId('word-picker').isVisible().catch(() => false);
  let drawer = aliceIsDrawer ? alice : bob;
  let guesser = aliceIsDrawer ? bob : alice;

  // Pick word and guess correctly
  const word1Button = drawer.locator('.pic-word-choice-btn').first();
  const word1 = await word1Button.textContent();
  await word1Button.click();
  await expect(guesser.getByTestId('guesser-view')).toBeVisible();
  await guesser.getByPlaceholder('Type your guess...').fill(word1!);
  await guesser.getByRole('button', { name: 'Guess' }).click();
  await expect(guesser.getByText('You guessed it!')).toBeVisible();
  await drawer.getByRole('button', { name: 'Done' }).click();

  // --- Turn 2 ---
  // Roles swap
  drawer = aliceIsDrawer ? bob : alice;
  guesser = aliceIsDrawer ? alice : bob;

  await expect(drawer.getByTestId('word-picker')).toBeVisible();
  const word2Button = drawer.locator('.pic-word-choice-btn').first();
  const word2 = await word2Button.textContent();
  await word2Button.click();
  await expect(guesser.getByTestId('guesser-view')).toBeVisible();
  await guesser.getByPlaceholder('Type your guess...').fill(word2!);
  await guesser.getByRole('button', { name: 'Guess' }).click();
  await expect(guesser.getByText('You guessed it!')).toBeVisible();
  await drawer.getByRole('button', { name: 'Done' }).click();

  // Both should see postgame
  await expect(alice.getByTestId('postgame')).toBeVisible();
  await expect(bob.getByTestId('postgame')).toBeVisible();
  await expect(alice.getByText('Final Scores')).toBeVisible();
});
