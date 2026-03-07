import type { PlayerId, PlayerInfo, ServerState, ReduceResult, Effect } from '../../types.js';
import type { DrawOp, ClientMessage } from '../../protocol.js';
import type {
  TurnRecord,
  PictionaryState,
  PictionaryWaitingState,
  PictionaryActiveState,
  PictionaryPostgameState,
} from './types.js';
import { pickWords } from './words.js';

export const TURN_DURATION_MS = 75_000;
export const ALL_GUESSED_GRACE_MS = 10_000;
export const HINT_REVEAL_MS = 20_000;
export const PICK_DURATION_MS = 15_000;

function pickRandomLetterIndex(word: string): number {
  const indices: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (/[a-zA-Z]/.test(word[i])) indices.push(i);
  }
  return indices[Math.floor(Math.random() * indices.length)];
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

export function addPlayer(
  state: PictionaryWaitingState,
  handle: string,
): { state: PictionaryWaitingState; playerId: PlayerId } {
  const playerId = String(state.nextPlayerId);
  const player: PlayerInfo = { id: playerId, handle, ready: false, connected: true };
  const players = new Map(state.players);
  players.set(playerId, player);
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
    order,
    currentTurnIndex: 0,
    word: '',
    wordChoices: pickWords(3),
    scores,
    turnDeadline: now + PICK_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    hintLetterIndex: 0,
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
    order,
    currentTurnIndex: 0,
    word: '',
    wordChoices: pickWords(3),
    scores,
    turnDeadline: now + PICK_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    hintLetterIndex: 0,
    currentTurnOps: [],
    currentTurnGuesses: [],
    completedTurns: [],
  };
}

function isCloseEnough(guess: string, answer: string): boolean {
  if (guess === answer) return true;
  const lenDiff = Math.abs(guess.length - answer.length);
  if (lenDiff > 1) return false;

  if (guess.length === answer.length) {
    // Check for exactly one substitution
    let diffs = 0;
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] !== answer[i]) diffs++;
      if (diffs > 1) return false;
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
  return { ...state, currentTurnOps: [...state.currentTurnOps, op] };
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
    const players = new Map(state.players);
    for (const [id, player] of players) {
      players.set(id, { ...player, ready: false });
    }
    return {
      phase: 'pictionary-postgame',
      players,
      scores: state.scores,
      turns: completedTurns,
    };
  }

  const now = Date.now();
  return {
    ...state,
    subPhase: 'picking' as const,
    currentTurnIndex: nextIndex,
    word: '',
    wordChoices: pickWords(3),
    turnDeadline: now + PICK_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    hintLetterIndex: 0,
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
  const now = Date.now();
  return {
    ...state,
    subPhase: 'drawing',
    word,
    wordChoices: [],
    turnDeadline: now + TURN_DURATION_MS,
    turnStartTime: now,
    hintLetterIndex: pickRandomLetterIndex(word),
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

import { addWord as picAddWord } from './words.js';

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

      const next = advanceTurn(state);
      return {
        state: next,
        effects: [{ type: 'broadcast' }, ...activeTimerEffects(next)],
      };
    }

    case 'add-word': {
      const playerHandle = state.players.get(playerId)?.handle ?? 'unknown';
      const word = msg.word.trim().toLowerCase();
      const added = picAddWord(msg.word, playerHandle);
      const message = added
        ? `"${word}" added!`
        : (word ? `"${word}" already exists.` : 'Word cannot be empty.');
      return {
        state,
        effects: [{
          type: 'send',
          playerId,
          msg: { type: 'add-word-result', success: added, message },
        }],
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
        const next = advanceTurn(removed);
        return {
          state: next,
          effects: [{ type: 'broadcast' }, ...activeTimerEffects(next)],
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

  // Drawing phase timed out
  const next = advanceTurn(state);
  return {
    state: next,
    effects: [{ type: 'broadcast' }, ...activeTimerEffects(next)],
  };
}
