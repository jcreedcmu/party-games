# Plan 06: Playwright E2E Tests

## Motivation

The existing test suite has good coverage of pure state logic (vitest unit tests)
and basic WebSocket integration (server.test.ts with raw WS clients). What's
missing is end-to-end testing that exercises the actual browser UI: form
interactions, phase transitions rendered in React, canvas drawing, and
multi-player flows where two browser sessions interact simultaneously.

Playwright supports multiple isolated `BrowserContext` instances in a single
test, which maps directly to simulating multiple players.

## Setup

### Installation & Config

- [ ] **1. Install Playwright.** `npm install -D @playwright/test` and
  `npx playwright install` (downloads browser binaries).

- [ ] **2. Create `playwright.config.ts`.** Key settings:
  ```ts
  import { defineConfig } from '@playwright/test';

  export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    use: {
      baseURL: 'http://localhost:3000',
    },
    webServer: {
      command: 'npm run build && npx tsx server/index.ts --password test --port 3000 --game epyc',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
  });
  ```
  Playwright's `webServer` option auto-starts and stops the server for the test
  run. For Pictionary tests, we'll need a second config or a fixture that
  starts a server with `--game pictionary` on a different port.

- [ ] **3. Create `e2e/` directory** for test files, separate from the vitest
  `server/__tests__/` directory.

- [ ] **4. Add npm script.** Add `"test:e2e": "playwright test"` to
  `package.json`.

### Test Utilities & Fixtures

- [ ] **5. Create `e2e/fixtures.ts`.** A custom Playwright fixture that:
  - Provides a `createPlayerPage(name)` helper that creates a new
    `BrowserContext` + `Page`, navigates to the app, fills in the join form,
    and returns the page.
  - Provides server lifecycle management if we need per-test servers (e.g.
    different game types).

  ```ts
  import { test as base } from '@playwright/test';

  type Fixtures = {
    createPlayerPage: (handle: string) => Promise<Page>;
  };

  export const test = base.extend<Fixtures>({
    createPlayerPage: async ({ browser }, use) => {
      const pages: Page[] = [];
      const factory = async (handle: string) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('/');
        await page.getByPlaceholder('Your name').fill(handle);
        await page.getByPlaceholder('Game password').fill('test');
        await page.getByRole('button', { name: 'Join' }).click();
        pages.push(page);
        return page;
      };
      await use(factory);
      for (const page of pages) await page.context().close();
    },
  });
  ```

### Data-Testid Attributes

- [ ] **6. Add `data-testid` attributes to key UI elements.** The current
  components use CSS classes but no test IDs. Add them selectively to elements
  that tests need to target reliably:

  **JoinDialog.tsx:**
  - `data-testid="handle-input"` on name input
  - `data-testid="password-input"` on password input
  - `data-testid="join-button"` on submit button

  **WaitingRoom.tsx:**
  - `data-testid="ready-button"` on ready/unready button
  - `data-testid="player-list"` on the `<ul>`

  **GameBoard.tsx / PictionaryBoard.tsx:**
  - `data-testid="game-board"` on the main game container
  - `data-testid="timer"` on the countdown display

  **PostGame.tsx / PictionaryPostGame.tsx:**
  - `data-testid="postgame"` on the postgame container
  - `data-testid="reset-button"` or `data-testid="ready-button"` on the
    play-again button

  Keep it minimal — Playwright's `getByRole`, `getByPlaceholder`, and
  `getByText` locators are preferred where they work. Only add `data-testid`
  where semantic selectors are ambiguous.

## Test Plan

### Tier 1: Smoke Tests (do first)

These validate the basic join → play → end flow works at all.

- [ ] **7. Join flow.** One player joins, sees the waiting room with their name.

- [ ] **8. Two-player ready-up.** Two players join, both click Ready, verify
  both transition to the game phase.

- [ ] **9. Disconnect banner.** Player joins, server stops (or WS is closed),
  verify the disconnect banner appears.

### Tier 2: EPYC Game Flow

- [ ] **10. Full EPYC round.** Two players join, ready up, both submit text
  moves, verify round advances. Submit again (drawing round), verify postgame
  appears for both.

- [ ] **11. EPYC postgame reset.** After a game ends, one player clicks Reset,
  verify both return to waiting room.

### Tier 3: Pictionary Game Flow

These need a server started with `--game pictionary`.

- [ ] **12. Pictionary word pick → draw → guess flow.** Two players join.
  Drawer picks a word, draws something (simulated mouse events on canvas),
  guesser submits a guess. Verify correct-guess feedback appears.

- [ ] **13. Pictionary turn completion.** After all guessers guess correctly (or
  timer expires), verify the turn advances to the next drawer.

- [ ] **14. Pictionary postgame.** After all turns complete, verify both players
  see the postgame scoreboard with turn replays.

### Tier 4: Edge Cases & Regressions

- [ ] **15. Mid-game disconnect.** A player disconnects during an active game.
  Verify the remaining player(s) can continue or the game handles it
  gracefully.

- [ ] **16. Wrong password.** Player tries to join with wrong password, verify
  error message appears and they stay on the join screen.

## Multi-Game-Type Strategy

Playwright's `webServer` config starts one server. For testing both game types:

**Option A: Two configs.** `playwright.config.ts` (EPYC, port 3000) and
`playwright-pictionary.config.ts` (Pictionary, port 3001). Run both via
`playwright test --config=...`.

**Option B: Per-test server fixture.** A custom fixture that starts/stops a
server for each test (or test group), parameterized by game type. More flexible,
but slower.

**Option C: Projects.** Playwright's `projects` config can run the same test dir
with different settings:
```ts
export default defineConfig({
  projects: [
    {
      name: 'epyc',
      testDir: './e2e/epyc',
      use: { baseURL: 'http://localhost:3000' },
      webServer: { command: '... --game epyc --port 3000', port: 3000 },
    },
    {
      name: 'pictionary',
      testDir: './e2e/pictionary',
      use: { baseURL: 'http://localhost:3001' },
      webServer: { command: '... --game pictionary --port 3001', port: 3001 },
    },
  ],
});
```

Leaning toward **Option C** — cleanest separation, runs in parallel.

## Canvas Interaction

Drawing tests are the trickiest part. Playwright provides `page.mouse` APIs:

```ts
const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
await page.mouse.move(box.x + 50, box.y + 50);
await page.mouse.down();
await page.mouse.move(box.x + 150, box.y + 150);
await page.mouse.up();
```

For visual regression, Playwright has built-in screenshot comparison:
```ts
await expect(canvas).toHaveScreenshot('drawing-after-stroke.png');
```

For functional tests (does the draw op reach the other player?), we can check
that the guesser's LiveCanvas receives and renders ops — either via screenshot
diff or by checking canvas pixel data.

## Relationship to Other Plans

- This plan is **independent** of Plans 01-04 (refactoring). Tests should be
  written against current behavior first, then serve as a safety net during
  refactoring.
- Executing this plan **before** the refactoring plans gives confidence that
  refactors don't break user-visible behavior.
- The `data-testid` additions (Step 6) are a small client change that can be
  done immediately.

## Risks

- **Flakiness.** WebSocket-based tests can be timing-sensitive. Use Playwright's
  auto-waiting and `expect(...).toBeVisible()` assertions rather than manual
  sleeps.
- **Canvas pixel differences.** Screenshot tests can be brittle across
  platforms/renders. Use tolerance thresholds or skip visual regression in CI
  initially.
- **Server startup time.** Playwright's `webServer` waits for the port to be
  available. We should pre-build the server instead of going through vite dev server.
  This will make the test closer to production behavior as well.
