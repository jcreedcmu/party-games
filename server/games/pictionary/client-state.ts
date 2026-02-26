import type { PlayerId } from '../../types.js';
import type { DrawOp } from '../../protocol.js';
import type {
  PictionaryState,
  PictionaryActiveState,
} from './types.js';
import { HINT_REVEAL_MS } from './state.js';
import { getWordEntry } from './words.js';

export type PictionaryClientWaitingState = {
  phase: 'pictionary-waiting';
  players: Array<{ id: string; handle: string; ready: boolean; connected: boolean }>;
};

export type PictionaryClientActivePlayer = {
  id: string;
  handle: string;
  connected: boolean;
  score: number;
  guessedThisTurn: boolean;
};

export type PictionaryClientActiveState = {
  phase: 'pictionary-active';
  role: 'drawer' | 'guesser';
  currentDrawerHandle: string;
  turnNumber: number;
  totalTurns: number;
  turnDeadline: number;
  word: string | null;
  wordHint: string;
  wordHintRevealed: string;
  hintRevealTime: number;
  guessedCorrectly: boolean;
  correctGuessers: string[];
  players: PictionaryClientActivePlayer[];
  lastTurnWord: string | null;
};

export type PictionaryClientGuessRecord = {
  handle: string;
  text: string;
  correct: boolean;
};

export type PictionaryClientTurnSummary = {
  drawerHandle: string;
  word: string;
  wordAddedBy?: string;
  wordAddedOn?: string;
  drawOps: DrawOp[];
  guessers: Array<{ handle: string; timeMs: number }>;
  guessLog: PictionaryClientGuessRecord[];
};

export type PictionaryClientPostgameState = {
  phase: 'pictionary-postgame';
  players: Array<{ id: string; handle: string; score: number }>;
  turns: PictionaryClientTurnSummary[];
};

export type PictionaryClientState =
  | PictionaryClientWaitingState
  | PictionaryClientActiveState
  | PictionaryClientPostgameState;

function getActiveClientState(
  state: PictionaryActiveState,
  playerId: PlayerId,
): PictionaryClientActiveState {
  const drawerId = state.order[state.currentTurnIndex];
  const drawerInfo = state.players.get(drawerId)!;
  const isDrawer = playerId === drawerId;
  const guessedIds = new Set(state.correctGuessers.map(g => g.playerId));

  const lastTurn = state.completedTurns.length > 0
    ? state.completedTurns[state.completedTurns.length - 1]
    : null;

  const wordHint = state.word.replace(/[a-zA-Z]/g, '_');
  const hintChars = [...wordHint];
  hintChars[state.hintLetterIndex] = state.word[state.hintLetterIndex];
  const wordHintRevealed = hintChars.join('');

  return {
    phase: 'pictionary-active',
    role: isDrawer ? 'drawer' : 'guesser',
    currentDrawerHandle: drawerInfo.handle,
    turnNumber: state.currentTurnIndex + 1,
    totalTurns: state.order.length,
    word: isDrawer ? state.word : null,
    wordHint,
    wordHintRevealed,
    hintRevealTime: state.turnDeadline - HINT_REVEAL_MS,
    turnDeadline: state.turnDeadline,
    guessedCorrectly: guessedIds.has(playerId),
    correctGuessers: state.correctGuessers.map(g => state.players.get(g.playerId)!.handle),
    players: Array.from(state.players.values()).map(p => ({
      id: p.id,
      handle: p.handle,
      connected: p.connected,
      score: state.scores.get(p.id) ?? 0,
      guessedThisTurn: guessedIds.has(p.id),
    })),
    lastTurnWord: lastTurn?.word ?? null,
  };
}

export function getClientState(
  state: PictionaryState,
  playerId: PlayerId,
): PictionaryClientState {
  switch (state.phase) {
    case 'pictionary-waiting':
      return {
        phase: 'pictionary-waiting',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id,
          handle: p.handle,
          ready: p.ready,
          connected: p.connected,
        })),
      };
    case 'pictionary-active':
      return getActiveClientState(state, playerId);
    case 'pictionary-postgame':
      return {
        phase: 'pictionary-postgame',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id,
          handle: p.handle,
          score: state.scores.get(p.id) ?? 0,
        })),
        turns: state.turns.map(t => {
          const entry = getWordEntry(t.word);
          return {
            drawerHandle: state.players.get(t.drawerId)!.handle,
            word: t.word,
            ...(entry?.added_by && { wordAddedBy: entry.added_by }),
            ...(entry?.added_on && { wordAddedOn: entry.added_on }),
            drawOps: t.drawOps,
            guessers: t.correctGuessers.map(g => ({
              handle: state.players.get(g.playerId)!.handle,
              timeMs: g.timeMs,
            })),
            guessLog: t.guessLog.map(g => ({
              handle: state.players.get(g.playerId)?.handle ?? 'Unknown',
              text: g.text,
              correct: g.correct,
            })),
          };
        }),
      };
  }
}
