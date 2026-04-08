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

- [x] **1. Install Playwright.** `npm install -D @playwright/test` and
  `npx playwright install` (downloads browser binaries).

- [x] **2. Create `playwright.config.ts`.** Two projects (epyc on port 3100,
  pictionary on port 3101), Firefox browser, workers: 1.

- [x] **3. Create `e2e/` directory** for test files, separate from the vitest
  `server/__tests__/` directory.

- [x] **4. Add npm script.** Add `"test:e2e": "playwright test"` to
  `package.json`.

### Test Utilities & Fixtures

- [x] **5. Create `e2e/fixtures.ts`.** A custom Playwright fixture that:
  - Provides a `createPlayerPage(name)` helper that creates a new
    `BrowserContext` + `Page`, navigates to the app, fills in the join form,
    and returns the page.

### Data-Testid Attributes

- [x] **6. Add `data-testid` attributes to key UI elements.** Added to
  WaitingRoom, GameBoard, PostGame, PictionaryBoard, PictionaryPostGame,
  DrawerView, GuesserView, WordPicker.

## Test Plan

### Tier 1: Smoke Tests

- [x] **7. Join flow.** One player joins, sees the waiting room with their name.

- [x] **8. Two-player ready-up.** Two players join, both click Ready, verify
  both transition to the game phase.

- [x] **9. Wrong password.** Player tries to join with wrong password, verify
  error message appears.

### Tier 2: EPYC Game Flow

- [x] **10. Full EPYC round.** Two players join, ready up, both submit moves
  (text or drawing depending on random first round type), verify round advances.
  Submit again, verify postgame appears for both.

- [x] **11. EPYC postgame reset.** After a game ends, one player clicks New Game,
  verify both return to waiting room.

### Tier 3: Pictionary Game Flow

- [x] **12. Pictionary word pick → draw → guess flow.** Two players join.
  Drawer picks a word, guesser submits a guess. Verify guess appears for both.

- [x] **13. Pictionary correct guess + turn advance.** Guesser guesses correctly,
  drawer clicks Done, verify turn advances and roles swap.

- [x] **14. Pictionary full game.** Two-turn game, both players guess correctly,
  verify postgame with final scores.

## Multi-Game-Type Strategy

Used **Option C: Projects** — cleanest separation, both servers start in parallel.

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
