import type { PlayerId, MoveType, ServerState, ReduceResult, Effect } from '../../types.js';
import type { ClientMessage } from '../../protocol.js';
import type {
  Move, Sheet,
  EpycState, EpycWaitingState, EpycUnderwayState, EpycPostgameState,
} from './types.js';

export const ROUND_DURATION_MS = 60_000;

export function createInitialState(): EpycWaitingState {
  return {
    phase: 'epyc-waiting',
    players: new Map(),
    nextPlayerId: 1,
  };
}

export function addPlayer(
  state: EpycWaitingState,
  handle: string,
  clientId: string,
): { state: EpycWaitingState; playerId: PlayerId } {
  const playerId = String(state.nextPlayerId);
  const player = { id: playerId, handle, ready: false, connected: true, clientId };
  const players = new Map(state.players);
  players.set(playerId, player);
  return {
    state: { ...state, players, nextPlayerId: state.nextPlayerId + 1 },
    playerId,
  };
}

export function removePlayer(state: EpycState, playerId: PlayerId): EpycState {
  if (state.phase === 'epyc-waiting') {
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
  state: EpycWaitingState,
  playerId: PlayerId,
  ready: boolean,
): EpycWaitingState {
  const players = new Map(state.players);
  const player = players.get(playerId);
  if (!player) return state;
  players.set(playerId, { ...player, ready });
  return { ...state, players };
}

export function checkAllReady(state: EpycWaitingState): EpycWaitingState | EpycUnderwayState {
  const playerList = Array.from(state.players.values());
  if (playerList.length < 2) return state;
  if (!playerList.every(p => p.ready)) return state;

  const n = playerList.length;
  const playerIds = playerList.map(p => p.id);
  const order = shuffle([...playerIds]);

  const sheets: Sheet[] = [];
  for (let i = 0; i < n; i++) {
    sheets.push({ originIndex: i, moves: [] });
  }

  const players = new Map(state.players);
  for (const [id, player] of players) {
    players.set(id, { ...player, ready: false });
  }

  return {
    phase: 'epyc-underway',
    players,
    sheets,
    order,
    currentRound: 0,
    firstMoveType: Math.random() < 0.5 ? 'text' : 'drawing',
    roundDeadline: Date.now() + ROUND_DURATION_MS,
    submittedThisRound: new Set(),
  };
}

export function submitMove(
  state: EpycUnderwayState,
  playerId: PlayerId,
  move: { type: MoveType; content: string },
): EpycUnderwayState {
  if (state.submittedThisRound.has(playerId)) return state;

  const expectedType = getExpectedMoveType(state.firstMoveType, state.currentRound);
  if (move.type !== expectedType) return state;

  const sheetIndex = getSheetIndexForPlayer(state.order, playerId, state.currentRound);
  const sheet = state.sheets[sheetIndex];
  const newMove: Move = { type: move.type, content: move.content, playerId };
  const newSheet: Sheet = { ...sheet, moves: [...sheet.moves, newMove] };
  const newSheets = state.sheets.map((s, i) => i === sheetIndex ? newSheet : s);

  const newSubmitted = new Set(state.submittedThisRound);
  newSubmitted.add(playerId);

  return { ...state, sheets: newSheets, submittedThisRound: newSubmitted };
}

/** Check if all connected players have submitted; if so, advance the round. */
export function checkRoundComplete(state: EpycUnderwayState): EpycUnderwayState | EpycPostgameState {
  const allAccountedFor = Array.from(state.players.values()).every(
    p => state.submittedThisRound.has(p.id) || !p.connected,
  );
  if (!allAccountedFor) return state;
  return advanceRound(state);
}

/** Advance to the next round (or postgame). Fills null for missing submissions. */
export function advanceRound(state: EpycUnderwayState): EpycUnderwayState | EpycPostgameState {
  // Fill null for players who didn't submit
  let sheets = [...state.sheets];
  for (const [, player] of state.players) {
    if (!state.submittedThisRound.has(player.id)) {
      const si = getSheetIndexForPlayer(state.order, player.id, state.currentRound);
      sheets = sheets.map((s, i) => i === si ? { ...s, moves: [...s.moves, null] } : s);
    }
  }

  const nextRound = state.currentRound + 1;
  const n = state.order.length;

  if (nextRound >= n) {
    return {
      phase: 'epyc-postgame',
      players: state.players,
      sheets,
      order: state.order,
    };
  }

  return {
    ...state,
    sheets,
    currentRound: nextRound,
    roundDeadline: Date.now() + ROUND_DURATION_MS,
    submittedThisRound: new Set(),
  };
}

export function resetGame(state: EpycState): EpycWaitingState {
  const players = new Map(
    Array.from(state.players.entries())
      .filter(([, p]) => p.connected)
      .map(([id, p]) => [id, { ...p, ready: false }] as const),
  );
  return {
    phase: 'epyc-waiting',
    players: players as EpycWaitingState['players'],
    nextPlayerId: Math.max(0, ...Array.from(state.players.keys()).map(Number)) + 1,
  };
}

// --- Helpers ---

export function getExpectedMoveType(firstMoveType: MoveType, round: number): MoveType {
  if (round % 2 === 0) return firstMoveType;
  return firstMoveType === 'text' ? 'drawing' : 'text';
}

/** In round r, player order[i] works on sheet (i - r + n) % n. */
export function getSheetIndexForPlayer(order: PlayerId[], playerId: PlayerId, round: number): number {
  const i = order.indexOf(playerId);
  const n = order.length;
  return ((i - round) % n + n) % n;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Reducers ---

function underwayTimerEffects(state: EpycUnderwayState | EpycPostgameState): Effect[] {
  if (state.phase === 'epyc-underway') {
    return [{ type: 'set-timer', deadline: state.roundDeadline }];
  }
  return [{ type: 'clear-timer' }];
}

export function epycReduce(state: ServerState, playerId: PlayerId, msg: ClientMessage): ReduceResult {
  switch (msg.type) {
    case 'ready':
    case 'unready': {
      if (state.phase !== 'epyc-waiting') return { state, effects: [] };
      const readied = setReady(state, playerId, msg.type === 'ready');
      const next = checkAllReady(readied);
      const effects: Effect[] = [{ type: 'broadcast' }];
      if (next.phase === 'epyc-underway') {
        effects.push({ type: 'set-timer', deadline: next.roundDeadline });
      }
      return { state: next, effects };
    }

    case 'submit': {
      if (state.phase !== 'epyc-underway') return { state, effects: [] };
      const submitted = submitMove(state, playerId, msg.move);
      const next = checkRoundComplete(submitted);
      return {
        state: next,
        effects: [{ type: 'broadcast' }, ...underwayTimerEffects(next)],
      };
    }

    case 'reset': {
      if (state.phase !== 'epyc-postgame') return { state, effects: [] };
      return {
        state: resetGame(state),
        effects: [{ type: 'clear-timer' }, { type: 'broadcast' }],
      };
    }

    case 'boot': {
      if (state.phase !== 'epyc-waiting') return { state, effects: [] };
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

export function epycReduceDisconnect(state: ServerState, playerId: PlayerId): ReduceResult {
  if (state.phase !== 'epyc-waiting' && state.phase !== 'epyc-underway' && state.phase !== 'epyc-postgame') {
    return { state, effects: [] };
  }
  const removed = removePlayer(state, playerId);
  if (removed.phase === 'epyc-underway') {
    const next = checkRoundComplete(removed);
    return {
      state: next,
      effects: [{ type: 'broadcast' }, ...underwayTimerEffects(next)],
    };
  }
  return { state: removed, effects: [{ type: 'broadcast' }] };
}

export function epycReduceTimer(state: ServerState): ReduceResult {
  if (state.phase !== 'epyc-underway') return { state, effects: [] };
  const next = advanceRound(state);
  return {
    state: next,
    effects: [{ type: 'broadcast' }, ...underwayTimerEffects(next)],
  };
}
