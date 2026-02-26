import type { PlayerId, PlayerInfo } from '../../types.js';
import type { DrawOp } from '../../protocol.js';
import type {
  TurnRecord,
  PictionaryState,
  PictionaryWaitingState,
  PictionaryActiveState,
  PictionaryPostgameState,
} from './types.js';
import { pickWord } from './words.js';

export const TURN_DURATION_MS = 75_000;
export const ALL_GUESSED_GRACE_MS = 10_000;

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

export function setReady(
  state: PictionaryWaitingState,
  playerId: PlayerId,
  ready: boolean,
): PictionaryWaitingState {
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
    phase: 'pictionary-active',
    players,
    order,
    currentTurnIndex: 0,
    word: pickWord(),
    scores,
    turnDeadline: now + TURN_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    currentTurnOps: [],
    completedTurns: [],
  };
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

  const correct = text.trim().toLowerCase() === state.word.toLowerCase();
  if (!correct) return { state, correct: false };

  const timeMs = Date.now() - state.turnStartTime;
  const remaining = Math.max(0, state.turnDeadline - Date.now());
  const guesserPoints = Math.max(1, Math.round(10 * remaining / TURN_DURATION_MS));

  const scores = new Map(state.scores);
  scores.set(playerId, (scores.get(playerId) ?? 0) + guesserPoints);
  scores.set(drawerId, (scores.get(drawerId) ?? 0) + 1);

  const correctGuessers = [...state.correctGuessers, { playerId, timeMs }];

  return {
    state: { ...state, scores, correctGuessers },
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
    return {
      phase: 'pictionary-postgame',
      players: state.players,
      scores: state.scores,
      turns: completedTurns,
    };
  }

  const now = Date.now();
  return {
    ...state,
    currentTurnIndex: nextIndex,
    word: pickWord(),
    turnDeadline: now + TURN_DURATION_MS,
    turnStartTime: now,
    correctGuessers: [],
    currentTurnOps: [],
    completedTurns,
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
