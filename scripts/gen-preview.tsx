// Usage: npx tsx --tsconfig client/tsconfig.json scripts/gen-preview.tsx
// Outputs: preview-dist/preview.html, preview-dist/preview.css
//
// Renders Pictionary game components to static HTML for CSS iteration.
// Canvas elements render as blank rectangles; guess feeds and timers are empty (SSR limitations).

import { renderToString } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as prettier from 'prettier';
import React from 'react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { JoinDialog } from '../client/src/components/JoinDialog';
import { WaitingRoom } from '../client/src/components/WaitingRoom';
import { WordPicker } from '../client/src/components/pictionary/WordPicker';
import { DrawerView } from '../client/src/components/pictionary/DrawerView';
import { GuesserView } from '../client/src/components/pictionary/GuesserView';
import { PictionaryPostGame } from '../client/src/components/pictionary/PictionaryPostGame';

import type {
  PictionaryClientWaitingState,
  PictionaryClientActiveState,
  PictionaryClientPostgameState,
  PictionaryClientTurnSummary,
  ClientMessage,
  RelayPayload,
} from '../server/protocol';

// --- Read and inline assets ---

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'preview-dist');
fs.mkdirSync(outDir, { recursive: true });

const appCss = fs.readFileSync(path.join(root, 'client', 'src', 'styles', 'main.css'), 'utf-8');

const logoSrc = 'drawplodocus.png';
fs.copyFileSync(path.join(root, 'client', 'public', 'drawplodocus.png'), path.join(outDir, logoSrc));

// --- Mock data ---

const noop = () => {};
const noopSend = (_msg: ClientMessage) => {};
const noopRelay = (_listener: (payload: RelayPayload) => void) => noop;

const players3 = [
  { id: 'p1', handle: 'Alice', ready: true, connected: true },
  { id: 'p2', handle: 'Bob', ready: false, connected: true },
  { id: 'p3', handle: 'Charlie', ready: true, connected: true },
];

const waitingState: PictionaryClientWaitingState = {
  phase: 'pictionary-waiting',
  players: players3,
};

const activePlayers = [
  { id: 'p1', handle: 'Alice', connected: true, score: 45, guessedThisTurn: true },
  { id: 'p2', handle: 'Bob', connected: true, score: 30, guessedThisTurn: false },
  { id: 'p3', handle: 'Charlie', connected: true, score: 20, guessedThisTurn: false },
  { id: 'p4', handle: 'Diana', connected: false, score: 10, guessedThisTurn: false },
];

const pickingState: PictionaryClientActiveState = {
  phase: 'pictionary-active',
  subPhase: 'picking',
  role: 'drawer',
  currentDrawerHandle: 'Alice',
  turnNumber: 2,
  totalTurns: 8,
  turnDeadline: Date.now() + 15000,
  word: null,
  wordChoices: ['elephant', 'skateboard', 'volcano'],
  wordHint: '',
  wordHintRevealed: '',
  hintRevealTime: Infinity,
  guessedCorrectly: false,
  correctGuessers: [],
  players: activePlayers,
  lastTurnWord: 'bicycle',
};

const drawerState: PictionaryClientActiveState = {
  phase: 'pictionary-active',
  subPhase: 'drawing',
  role: 'drawer',
  currentDrawerHandle: 'Alice',
  turnNumber: 3,
  totalTurns: 8,
  turnDeadline: Date.now() + 42000,
  word: 'elephant',
  wordChoices: null,
  wordHint: '________',
  wordHintRevealed: '__e_____',
  hintRevealTime: Date.now() - 5000,
  guessedCorrectly: false,
  correctGuessers: ['Bob'],
  players: activePlayers,
  lastTurnWord: 'bicycle',
};

const guesserState: PictionaryClientActiveState = {
  phase: 'pictionary-active',
  subPhase: 'drawing',
  role: 'guesser',
  currentDrawerHandle: 'Alice',
  turnNumber: 3,
  totalTurns: 8,
  turnDeadline: Date.now() + 42000,
  word: null,
  wordChoices: null,
  wordHint: '________',
  wordHintRevealed: '__e_____',
  hintRevealTime: Date.now() - 5000,
  guessedCorrectly: false,
  correctGuessers: ['Bob'],
  players: activePlayers,
  lastTurnWord: 'bicycle',
};

const mockTurns: PictionaryClientTurnSummary[] = [
  {
    drawerHandle: 'Alice',
    word: 'bicycle',
    drawOps: [],
    guessers: [
      { handle: 'Bob', timeMs: 12300 },
      { handle: 'Charlie', timeMs: 28700 },
    ],
    guessLog: [
      { handle: 'Bob', text: 'bike', correct: false },
      { handle: 'Charlie', text: 'motorcycle', correct: false },
      { handle: 'Bob', text: 'bicycle', correct: true },
      { handle: 'Charlie', text: 'bicycle', correct: true },
    ],
  },
  {
    drawerHandle: 'Bob',
    word: 'volcano',
    wordAddedBy: 'Diana',
    drawOps: [],
    guessers: [{ handle: 'Alice', timeMs: 45200 }],
    guessLog: [
      { handle: 'Alice', text: 'mountain', correct: false },
      { handle: 'Charlie', text: 'fire', correct: false },
      { handle: 'Alice', text: 'volcano', correct: true },
    ],
  },
  {
    drawerHandle: 'Charlie',
    word: 'skateboard',
    drawOps: [],
    guessers: [],
    guessLog: [
      { handle: 'Alice', text: 'surfboard', correct: false },
      { handle: 'Bob', text: 'snowboard', correct: false },
    ],
  },
];

const postgameState: PictionaryClientPostgameState = {
  phase: 'pictionary-postgame',
  players: [
    { id: 'p1', handle: 'Alice', score: 120, ready: false, connected: true },
    { id: 'p2', handle: 'Bob', score: 95, ready: false, connected: true },
    { id: 'p3', handle: 'Charlie', score: 60, ready: false, connected: true },
    { id: 'p4', handle: 'Diana', score: 30, ready: false, connected: false },
  ],
  turns: mockTurns,
};

// --- Render sections ---

type Section = { title: string; html: string };

function renderInAppWrapper(component: React.ReactElement): string {
  const wrapped = React.createElement('div', { className: 'app' },
    React.createElement('img', { src: logoSrc, alt: 'Drawplodocus', className: 'logo' }),
    React.createElement('div', { className: 'card' }, component),
  );
  return renderToString(wrapped);
}

const sections: Section[] = [
  {
    title: 'Login',
    html: renderInAppWrapper(
      React.createElement(JoinDialog, { onJoin: noop, error: null, onClearError: noop }),
    ),
  },
  {
    title: 'Lobby',
    html: renderInAppWrapper(
      React.createElement(WaitingRoom, {
        state: waitingState,
        playerId: 'p1',
        onReady: noop,
        onUnready: noop,
        send: noopSend,
        addWordResult: { success: true, message: 'Added "spaceship"!' },
        clearAddWordResult: noop,
      }),
    ),
  },
  {
    title: 'Word Picking (Drawer)',
    html: renderInAppWrapper(
      React.createElement(WordPicker, { state: pickingState, send: noopSend }),
    ),
  },
  {
    title: 'Drawing (Drawer View)',
    html: renderInAppWrapper(
      React.createElement(DrawerView, {
        state: drawerState,
        send: noopSend,
        onRelay: noopRelay,
        initialGuesses: [
          { handle: 'Bob', correct: false, text: 'trunk' },
          { handle: 'Charlie', correct: false, text: 'tree' },
          { handle: 'Bob', correct: true, text: null },
          { handle: 'Charlie', correct: false, text: 'mammoth' },
        ],
      }),
    ),
  },
  {
    title: 'Drawing (Guesser View)',
    html: renderInAppWrapper(
      React.createElement(GuesserView, {
        state: guesserState,
        playerId: 'p2',
        send: noopSend,
        onRelay: noopRelay,
        initialGuesses: [
          { handle: 'Bob', correct: false, text: 'trunk' },
          { handle: 'Bob', correct: true, text: null },
          { handle: 'Charlie', correct: false, text: 'mammoth' },
        ],
      }),
    ),
  },
  {
    title: 'Postgame',
    html: renderInAppWrapper(
      React.createElement(PictionaryPostGame, { state: postgameState, onNewGame: noop }),
    ),
  },
];

// --- Output files ---

const sectionDivs = sections
  .map((s, i) => `<div class="preview-section" data-section="${i}" ${i === 0 ? '' : 'style="display:none"'}>${s.html}</div>`)
  .join('\n');

const tabs = sections
  .map((s, i) => `<button class="preview-tab${i === 0 ? ' active' : ''}" data-section="${i}">${s.title}</button>`)
  .join('\n      ');

const previewCss = `/* Preview-specific styles */

.preview-section { max-width: 600px; margin: 1rem auto; }

.preview-topbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  background: #2a2a2a;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  flex-wrap: wrap;
}

.preview-tab {
  padding: 0.4rem 0.9rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #aaa;
  font-family: 'Fredoka', system-ui, sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
}

.preview-tab:hover { background: #444; color: #fff; }
.preview-tab.active { background: #4169e1; color: #fff; }
`;

const cssOut = appCss + '\n' + previewCss;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pictionary Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="preview.css">
</head>
<body>
<div class="preview-topbar">
  ${tabs}
</div>
${sectionDivs}
<div style="height:4rem"></div>
<script>
document.querySelector('.preview-topbar').addEventListener('click', function(e) {
  var btn = e.target.closest('.preview-tab');
  if (!btn) return;
  var idx = btn.dataset.section;
  document.querySelectorAll('.preview-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('.preview-section').forEach(function(s) {
    s.style.display = s.dataset.section === idx ? '' : 'none';
  });
});
</script>
</body>
</html>
`;

const formatted = await prettier.format(html, { parser: 'html' });
fs.writeFileSync(path.join(outDir, 'preview.css'), cssOut);
fs.writeFileSync(path.join(outDir, 'preview.html'), formatted);
console.log('Wrote preview-dist/preview.html and preview-dist/preview.css');
