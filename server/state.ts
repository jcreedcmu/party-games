import type {
  PlayerId, Move, MoveType, Sheet,
  GameState, WaitingState, UnderwayState, PostgameState,
} from './types.js';
import type { ClientGameState } from './protocol.js';

export const ROUND_DURATION_MS = 60_000;

export function createInitialState(): WaitingState {
  return {
    phase: 'waiting',
    players: new Map(),
    nextPlayerId: 1,
  };
}

export function addPlayer(
  state: WaitingState,
  handle: string,
): { state: WaitingState; playerId: PlayerId } {
  const playerId = String(state.nextPlayerId);
  const player = { id: playerId, handle, ready: false, connected: true };
  const players = new Map(state.players);
  players.set(playerId, player);
  return {
    state: { ...state, players, nextPlayerId: state.nextPlayerId + 1 },
    playerId,
  };
}

export function removePlayer(state: GameState, playerId: PlayerId): GameState {
  if (state.phase === 'waiting') {
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
  state: WaitingState,
  playerId: PlayerId,
  ready: boolean,
): WaitingState {
  const players = new Map(state.players);
  const player = players.get(playerId);
  if (!player) return state;
  players.set(playerId, { ...player, ready });
  return { ...state, players };
}

export function checkAllReady(state: WaitingState): WaitingState | UnderwayState {
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
    phase: 'underway',
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
  state: UnderwayState,
  playerId: PlayerId,
  move: { type: MoveType; content: string },
): UnderwayState {
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
export function checkRoundComplete(state: UnderwayState): UnderwayState | PostgameState {
  const allAccountedFor = Array.from(state.players.values()).every(
    p => state.submittedThisRound.has(p.id) || !p.connected,
  );
  if (!allAccountedFor) return state;
  return advanceRound(state);
}

/** Advance to the next round (or postgame). Fills null for missing submissions. */
export function advanceRound(state: UnderwayState): UnderwayState | PostgameState {
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
      phase: 'postgame',
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

export function getClientState(state: GameState, playerId: PlayerId): ClientGameState {
  switch (state.phase) {
    case 'waiting':
      return {
        phase: 'waiting',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id, handle: p.handle, ready: p.ready, connected: p.connected,
        })),
      };

    case 'underway': {
      const sheetIndex = getSheetIndexForPlayer(state.order, playerId, state.currentRound);
      const sheet = state.sheets[sheetIndex];
      const lastEntry = sheet.moves.length > 0 ? sheet.moves[sheet.moves.length - 1] : null;
      const previousMove = lastEntry
        ? { type: lastEntry.type, content: lastEntry.content }
        : null;

      return {
        phase: 'underway',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id, handle: p.handle, ready: false, connected: p.connected,
          submitted: state.submittedThisRound.has(p.id),
        })),
        currentRound: state.currentRound,
        totalRounds: state.order.length,
        expectedMoveType: getExpectedMoveType(state.firstMoveType, state.currentRound),
        roundDeadline: state.roundDeadline,
        submitted: state.submittedThisRound.has(playerId),
        previousMove,
      };
    }

    case 'postgame':
      return {
        phase: 'postgame',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id, handle: p.handle,
        })),
        sheets: state.sheets.map((sheet, i) => ({
          sheetIndex: i,
          moves: sheet.moves.map(m =>
            m ? { type: m.type, content: m.content, playerHandle: state.players.get(m.playerId)?.handle ?? 'Unknown' }
              : null
          ),
        })),
      };
  }
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

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
