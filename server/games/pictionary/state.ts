import type { PlayerId, PlayerInfo, ServerState, ReduceResult, Effect } from '../../types.js';
import type { DrawOp, ClientMessage } from '../../protocol.js';
import type {
  TurnRecord,
  PictionaryState,
  PictionaryWaitingState,
  PictionaryActiveState,
  PictionaryPostgameState,
} from './types.js';
import { pickWords, recordPresented, recordChosen, recordGuessOutcome } from './words.js';

export const TURN_DURATION_MS = 105_000;
export const ALL_GUESSED_GRACE_MS = 20_000;
export const PICK_DURATION_MS = 15_000;
export const REVEAL_DURATION_MS = 5_000;
export const TOTAL_ROUNDS = 3;

function pickAndRecordWords(n: number): string[] {
  const words = pickWords(n);
  recordPresented(words);
  return words;
}

function pickRandomLetterIndices(word: string, count: number): number[] {
  const available: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (/[a-zA-Z]/.test(word[i])) available.push(i);
  }
  const picked: number[] = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const j = Math.floor(Math.random() * available.length);
    picked.push(available[j]);
    available.splice(j, 1);
  }
  return picked;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createInitialState(): PictionaryWaitingState {
  return {
    phase: 'pictionary-waiting',
    players: new Map(),
    nextPlayerId: 1,
  };
}

export function addPlayer<S extends PictionaryState>(
  state: S,
  handle: string,
): { state: S; playerId: PlayerId } {
  const playerId = String(state.nextPlayerId);
  const player: PlayerInfo = { id: playerId, handle, ready: false, connected: true };
  const players = new Map(state.players);
  players.set(playerId, player);
  if (state.phase === 'pictionary-active') {
    const scores = new Map(state.scores);
    scores.set(playerId, 0);
    return {
      state: { ...state, players, scores, nextPlayerId: state.nextPlayerId + 1 },
      playerId,
    };
  }
  return {
    state: { ...state, players, nextPlayerId: state.nextPlayerId + 1 },
    playerId,
  };
}

export function removePlayer(state: PictionaryState, playerId: PlayerId): PictionaryState {
  if (state.phase === 'pictionary-waiting') {
    const players = new Map(state.players);
    players.delete(playerId);
    return { ...state, players };
  }
  const players = new Map(state.players);
  const player = players.get(playerId);
  if (player) {
    players.set(playerId, { ...player, connected: false });
  }
  return { ...state, players };
}

export function setReady<S extends PictionaryWaitingState | PictionaryPostgameState>(
  state: S,
  playerId: PlayerId,
  ready: boolean,
): S {
  const players = new Map(state.players);
  const player = players.get(playerId);
  if (!player) return state;
  players.set(playerId, { ...player, ready });
  return { ...state, players };
}

export function checkAllReady(
  state: PictionaryWaitingState,
): PictionaryWaitingState | PictionaryActiveState {
  const playerList = Array.from(state.players.values());
  if (playerList.length < 2) return state;
  if (!playerList.every(p => p.ready)) return state;

  const playerIds = playerList.map(p => p.id);
  const order = shuffle([...playerIds]);

  const players = new Map(state.players);
  for (const [id, player] of players) {
    players.set(id, { ...player, ready: false });
  }

  const scores = new Map<PlayerId, number>();
  for (const id of playerIds) {
    scores.set(id, 0);
  }

  const now = Date.now();
  return {
    phase: 'pictionary-active' as const,
    subPhase: 'picking' as const,
    players,
    nextPlayerId: state.nextPlayerId,
    order,
    currentTurnIndex: 0,
    currentRound: 0,
    totalRounds: TOTAL_ROUNDS,
    word: '',
    wordChoices: pickAndRecordWords(3),
    scores,
    turnDeadline: now + PICK_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    hintLetterIndices: [],
    currentTurnOps: [],
    currentTurnGuesses: [],
    completedTurns: [],
  };
}

export function checkAllReadyPostgame(
  state: PictionaryPostgameState,
): PictionaryPostgameState | PictionaryActiveState {
  const connectedPlayers = Array.from(state.players.values()).filter(p => p.connected);
  if (connectedPlayers.length < 2) return state;
  if (!connectedPlayers.every(p => p.ready)) return state;

  const playerIds = connectedPlayers.map(p => p.id);
  const order = shuffle([...playerIds]);

  const players = new Map(state.players);
  for (const [id, player] of players) {
    players.set(id, { ...player, ready: false });
  }

  const scores = new Map<PlayerId, number>();
  for (const id of playerIds) {
    scores.set(id, 0);
  }

  const now = Date.now();
  return {
    phase: 'pictionary-active' as const,
    subPhase: 'picking' as const,
    players,
    nextPlayerId: state.nextPlayerId,
    order,
    currentTurnIndex: 0,
    currentRound: 0,
    totalRounds: TOTAL_ROUNDS,
    word: '',
    wordChoices: pickAndRecordWords(3),
    scores,
    turnDeadline: now + PICK_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    hintLetterIndices: [],
    currentTurnOps: [],
    currentTurnGuesses: [],
    completedTurns: [],
  };
}

export function stripPunctuation(s: string): string {
  return s.replace(/[^a-z0-9 ]/g, '');
}

export function isCloseEnough(guess: string, answer: string): boolean {
  // Normalize out punctuation so "t-rex" matches "trex", "t rex", etc.
  guess = stripPunctuation(guess);
  answer = stripPunctuation(answer);
  if (guess === answer) return true;
  const lenDiff = Math.abs(guess.length - answer.length);
  if (lenDiff > 1) return false;

  if (guess.length === answer.length) {
    // Check for exactly one substitution or one adjacent transposition
    let diffs = 0;
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] !== answer[i]) {
        diffs++;
        if (diffs > 1) return false;
        // Check if this is an adjacent transposition
        if (i + 1 < guess.length &&
          guess[i] === answer[i + 1] &&
          guess[i + 1] === answer[i]) {
          i++; // skip the next character, it's the other half of the swap
        }
      }
    }
    return diffs === 1;
  }

  // Check for exactly one insertion/deletion
  const [shorter, longer] = guess.length < answer.length ? [guess, answer] : [answer, guess];
  let i = 0, j = 0, diffs = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] !== longer[j]) {
      diffs++;
      if (diffs > 1) return false;
      j++;
    } else {
      i++;
      j++;
    }
  }
  return true;
}

export function getCurrentDrawer(state: PictionaryActiveState): PlayerId {
  return state.order[state.currentTurnIndex];
}

export function recordDrawOp(state: PictionaryActiveState, op: DrawOp): PictionaryActiveState {
  const t = Date.now() - state.turnStartTime;
  return { ...state, currentTurnOps: [...state.currentTurnOps, { ...op, t }] };
}

export function submitGuess(
  state: PictionaryActiveState,
  playerId: PlayerId,
  text: string,
): { state: PictionaryActiveState; correct: boolean } {
  const drawerId = getCurrentDrawer(state);
  if (playerId === drawerId) return { state, correct: false };
  if (state.correctGuessers.some(g => g.playerId === playerId)) return { state, correct: false };

  const correct = isCloseEnough(text.trim().toLowerCase(), state.word.toLowerCase());
  recordGuessOutcome(state.word, correct);
  const guessRecord = { playerId, text: text.trim(), correct };
  const currentTurnGuesses = [...state.currentTurnGuesses, guessRecord];

  if (!correct) return { state: { ...state, currentTurnGuesses }, correct: false };

  const timeMs = Date.now() - state.turnStartTime;
  const remaining = Math.max(0, state.turnDeadline - Date.now());
  const guesserPoints = Math.max(1, Math.round(10 * remaining / TURN_DURATION_MS));

  const scores = new Map(state.scores);
  scores.set(playerId, (scores.get(playerId) ?? 0) + guesserPoints);
  scores.set(drawerId, (scores.get(drawerId) ?? 0) + 1);

  const correctGuessers = [...state.correctGuessers, { playerId, timeMs }];

  return {
    state: { ...state, scores, correctGuessers, currentTurnGuesses },
    correct: true,
  };
}

export function checkTurnComplete(state: PictionaryActiveState): boolean {
  const drawerId = getCurrentDrawer(state);
  const guessedIds = new Set(state.correctGuessers.map(g => g.playerId));
  for (const [id, player] of state.players) {
    if (id === drawerId) continue;
    if (!player.connected) continue;
    if (!guessedIds.has(id)) return false;
  }
  return true;
}

export function shortenDeadline(state: PictionaryActiveState): PictionaryActiveState {
  const graceDeadline = Date.now() + ALL_GUESSED_GRACE_MS;
  const newDeadline = Math.min(state.turnDeadline, graceDeadline);
  return { ...state, turnDeadline: newDeadline };
}

export function startReveal(state: PictionaryActiveState): PictionaryActiveState {
  const now = Date.now();
  return {
    ...state,
    subPhase: 'reveal',
    turnDeadline: now + REVEAL_DURATION_MS,
  };
}

export function advanceTurn(
  state: PictionaryActiveState,
): PictionaryActiveState | PictionaryPostgameState {
  const turnRecord: TurnRecord = {
    drawerId: getCurrentDrawer(state),
    word: state.word,
    drawOps: state.currentTurnOps,
    correctGuessers: state.correctGuessers,
    guessLog: state.currentTurnGuesses,
  };
  const completedTurns = [...state.completedTurns, turnRecord];

  // Find next connected drawer
  let nextIndex = state.currentTurnIndex + 1;
  while (nextIndex < state.order.length) {
    const nextDrawerId = state.order[nextIndex];
    const player = state.players.get(nextDrawerId);
    if (player && player.connected) break;
    nextIndex++;
  }

  if (nextIndex >= state.order.length) {
    const nextRound = state.currentRound + 1;
    if (nextRound >= state.totalRounds) {
      const players = new Map(state.players);
      for (const [id, player] of players) {
        players.set(id, { ...player, ready: false });
      }
      return {
        phase: 'pictionary-postgame',
        players,
        nextPlayerId: state.nextPlayerId,
        scores: state.scores,
        turns: completedTurns,
      };
    }

    // Start next round — same order, but append any late-joiners
    const orderSet = new Set(state.order);
    const lateJoiners = Array.from(state.players.entries())
      .filter(([id, p]) => p.connected && !orderSet.has(id))
      .map(([id]) => id);
    const newOrder = [...state.order, ...lateJoiners];

    // Find first connected player in the order
    let startIndex = 0;
    while (startIndex < newOrder.length) {
      const p = state.players.get(newOrder[startIndex]);
      if (p && p.connected) break;
      startIndex++;
    }

    const now = Date.now();
    return {
      ...state,
      subPhase: 'picking' as const,
      order: newOrder,
      currentTurnIndex: startIndex,
      currentRound: nextRound,
      word: '',
      wordChoices: pickAndRecordWords(3),
      turnDeadline: now + PICK_DURATION_MS,
      turnStartTime: now,
      correctGuessers: [],
      hintLetterIndices: [],
      currentTurnOps: [],
      currentTurnGuesses: [],
      completedTurns,
    };
  }

  const now = Date.now();
  return {
    ...state,
    subPhase: 'picking' as const,
    currentTurnIndex: nextIndex,
    word: '',
    wordChoices: pickAndRecordWords(3),
    turnDeadline: now + PICK_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    hintLetterIndices: [],
    currentTurnOps: [],
    currentTurnGuesses: [],
    completedTurns,
  };
}

export function selectWord(
  state: PictionaryActiveState,
  choiceIndex: number,
): PictionaryActiveState {
  if (state.subPhase !== 'picking') return state;
  if (choiceIndex < 0 || choiceIndex >= state.wordChoices.length) return state;

  const word = state.wordChoices[choiceIndex];
  recordChosen(word);
  const now = Date.now();
  return {
    ...state,
    subPhase: 'drawing',
    word,
    wordChoices: [],
    turnDeadline: now + TURN_DURATION_MS,
    turnStartTime: now,
    hintLetterIndices: pickRandomLetterIndices(word, 3),
  };
}

export function resetGame(state: PictionaryState): PictionaryWaitingState {
  const players = new Map(
    Array.from(state.players.entries())
      .filter(([, p]) => p.connected)
      .map(([id, p]) => [id, { ...p, ready: false }] as const),
  );
  return {
    phase: 'pictionary-waiting',
    players: players as PictionaryWaitingState['players'],
    nextPlayerId: Math.max(0, ...Array.from(state.players.keys()).map(Number)) + 1,
  };
}

// --- Reducers ---

import { addWord as picAddWord, type AddWordResult } from './words.js';

function activeTimerEffects(state: PictionaryActiveState | PictionaryPostgameState): Effect[] {
  if (state.phase === 'pictionary-active') {
    return [{ type: 'set-timer', deadline: state.turnDeadline }];
  }
  return [{ type: 'clear-timer' }];
}

export function pictionaryReduce(state: ServerState, playerId: PlayerId, msg: ClientMessage): ReduceResult {
  switch (msg.type) {
    case 'ready':
    case 'unready': {
      if (state.phase === 'pictionary-waiting') {
        const readied = setReady(state, playerId, msg.type === 'ready');
        const next = checkAllReady(readied);
        const effects: Effect[] = [{ type: 'broadcast' }];
        if (next.phase === 'pictionary-active') {
          effects.push({ type: 'set-timer', deadline: next.turnDeadline });
        }
        return { state: next, effects };
      }
      if (state.phase === 'pictionary-postgame') {
        const readied = setReady(state, playerId, msg.type === 'ready');
        const next = checkAllReadyPostgame(readied);
        const effects: Effect[] = [{ type: 'broadcast' }];
        if (next.phase === 'pictionary-active') {
          effects.push({ type: 'set-timer', deadline: next.turnDeadline });
        }
        return { state: next, effects };
      }
      return { state, effects: [] };
    }

    case 'draw-start':
    case 'draw-move':
    case 'draw-end':
    case 'draw-fill':
    case 'draw-undo':
    case 'draw-clear': {
      if (state.phase !== 'pictionary-active') return { state, effects: [] };
      if (state.subPhase !== 'drawing') return { state, effects: [] };
      const drawerId = getCurrentDrawer(state);
      if (playerId !== drawerId) return { state, effects: [] };

      const next = recordDrawOp(state, msg as DrawOp);
      const targets = Array.from(next.players.entries())
        .filter(([id, p]) => id !== drawerId && p.connected)
        .map(([id]) => id);

      return {
        state: next,
        effects: [{ type: 'relay', messages: [{ to: targets, payload: msg as DrawOp }] }],
      };
    }

    case 'guess': {
      if (state.phase !== 'pictionary-active') return { state, effects: [] };
      if (state.subPhase !== 'drawing') return { state, effects: [] };

      // Already-correct guessers can still chat but don't re-guess
      const alreadyGuessed = state.correctGuessers.some(g => g.playerId === playerId);
      if (alreadyGuessed) {
        const handle = state.players.get(playerId)!.handle;
        const allConnected = Array.from(state.players.entries())
          .filter(([, p]) => p.connected)
          .map(([id]) => id);
        return {
          state,
          effects: [{
            type: 'relay',
            messages: [{
              to: allConnected,
              payload: { type: 'guess-result', handle, correct: false, text: msg.text },
            }],
          }],
        };
      }

      const guessResult = submitGuess(state, playerId, msg.text);
      const handle = guessResult.state.players.get(playerId)!.handle;
      const allConnected = Array.from(guessResult.state.players.entries())
        .filter(([, p]) => p.connected)
        .map(([id]) => id);

      const effects: Effect[] = [
        {
          type: 'relay',
          messages: [{
            to: allConnected,
            payload: {
              type: 'guess-result',
              handle,
              correct: guessResult.correct,
              text: guessResult.correct ? null : msg.text,
            },
          }],
        },
        { type: 'broadcast' },
      ];

      if (guessResult.correct && checkTurnComplete(guessResult.state)) {
        const shortened = shortenDeadline(guessResult.state);
        effects.push({ type: 'set-timer', deadline: shortened.turnDeadline });
        return { state: shortened, effects };
      }

      return { state: guessResult.state, effects };
    }

    case 'pick-word': {
      if (state.phase !== 'pictionary-active') return { state, effects: [] };
      if (state.subPhase !== 'picking') return { state, effects: [] };
      if (playerId !== getCurrentDrawer(state)) return { state, effects: [] };

      const next = selectWord(state, msg.index);
      return {
        state: next,
        effects: [
          { type: 'set-timer', deadline: next.turnDeadline },
          { type: 'broadcast' },
        ],
      };
    }

    case 'turn-done': {
      if (state.phase !== 'pictionary-active') return { state, effects: [] };
      if (state.subPhase !== 'drawing') return { state, effects: [] };
      if (playerId !== getCurrentDrawer(state)) return { state, effects: [] };

      const next = startReveal(state);
      return {
        state: next,
        effects: [{ type: 'broadcast' }, { type: 'set-timer', deadline: next.turnDeadline }],
      };
    }

    case 'add-word': {
      const playerHandle = state.players.get(playerId)?.handle ?? 'unknown';
      const word = msg.word.trim().toLowerCase();
      const result: AddWordResult = picAddWord(msg.word, playerHandle);
      const messages: Record<AddWordResult, string> = {
        'added': `"${word}" added!`,
        'invalid': 'Words can only contain letters, spaces, hyphens, and apostrophes.',
        'duplicate': `"${word}" already exists.`,
        'empty': 'Word cannot be empty.',
        'persist-failed': `Failed to save "${word}" — word list is not writable.`,
      };
      return {
        state,
        effects: [{
          type: 'send',
          playerId,
          msg: { type: 'add-word-result', success: result === 'added', message: messages[result] },
        }],
      };
    }

    case 'boot': {
      if (state.phase !== 'pictionary-waiting' && state.phase !== 'pictionary-postgame') {
        return { state, effects: [] };
      }
      const targetId = msg.targetId;
      if (targetId === playerId) return { state, effects: [] };
      if (!state.players.has(targetId)) return { state, effects: [] };
      const next = removePlayer(state, targetId);
      return {
        state: next,
        effects: [{ type: 'kick', playerId: targetId }, { type: 'broadcast' }],
      };
    }

    default:
      return { state, effects: [] };
  }
}

export function pictionaryReduceDisconnect(state: ServerState, playerId: PlayerId): ReduceResult {
  if (state.phase === 'pictionary-active') {
    const wasDrawer = getCurrentDrawer(state) === playerId;
    const removed = removePlayer(state, playerId);
    if (removed.phase === 'pictionary-active') {
      if (wasDrawer || checkTurnComplete(removed)) {
        const next = startReveal(removed);
        return {
          state: next,
          effects: [{ type: 'broadcast' }, { type: 'set-timer', deadline: next.turnDeadline }],
        };
      }
    }
    return { state: removed, effects: [{ type: 'broadcast' }] };
  }

  if (state.phase !== 'pictionary-waiting' && state.phase !== 'pictionary-postgame') {
    return { state, effects: [] };
  }
  const removed = removePlayer(state, playerId);
  return { state: removed, effects: [{ type: 'broadcast' }] };
}

export function pictionaryReduceTimer(state: ServerState): ReduceResult {
  if (state.phase !== 'pictionary-active') return { state, effects: [] };

  if (state.subPhase === 'picking') {
    const randomIndex = Math.floor(Math.random() * state.wordChoices.length);
    const next = selectWord(state, randomIndex);
    return {
      state: next,
      effects: [
        { type: 'set-timer', deadline: next.turnDeadline },
        { type: 'broadcast' },
      ],
    };
  }

  if (state.subPhase === 'drawing') {
    // Drawing phase timed out — show reveal
    const next = startReveal(state);
    return {
      state: next,
      effects: [{ type: 'broadcast' }, { type: 'set-timer', deadline: next.turnDeadline }],
    };
  }

  // Reveal phase timed out — advance to next turn
  const next = advanceTurn(state);
  return {
    state: next,
    effects: [{ type: 'broadcast' }, ...activeTimerEffects(next)],
  };
}
