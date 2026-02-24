import type {
  PlayerId, PlayerInfo, Move, MoveType, Sheet,
  GameState, WaitingState, UnderwayState, PostgameState,
} from './types.js';
import type {
  ClientGameState, ClientSheetView,
} from './protocol.js';

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
  const player: PlayerInfo = { id: playerId, handle, ready: false, connected: true };
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
  // In underway/postgame, mark as disconnected
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
    sheets.push({
      originIndex: i,
      firstMoveType: Math.random() < 0.5 ? 'text' : 'drawing',
      moves: [],
    });
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
  };
}

export function submitMove(
  state: UnderwayState,
  playerId: PlayerId,
  sheetIndex: number,
  move: { type: MoveType; content: string },
): UnderwayState | PostgameState {
  const sheet = state.sheets[sheetIndex];
  if (!sheet) return state;

  const n = state.order.length;
  if (isSheetDone(sheet, n)) return state;

  const assignee = getSheetAssignee(state.order, sheet);
  if (assignee !== playerId) return state;

  const expectedType = getExpectedMoveType(sheet);
  if (move.type !== expectedType) return state;

  const newMove: Move = { type: move.type, content: move.content, playerId };
  const newSheet: Sheet = { ...sheet, moves: [...sheet.moves, newMove] };
  const newSheets = state.sheets.map((s, i) => i === sheetIndex ? newSheet : s);

  const allDone = newSheets.every(s => isSheetDone(s, n));
  if (allDone) {
    return {
      phase: 'postgame',
      players: state.players,
      sheets: newSheets,
      order: state.order,
    };
  }

  return { ...state, sheets: newSheets };
}

export function getClientState(state: GameState, playerId: PlayerId): ClientGameState {
  switch (state.phase) {
    case 'waiting':
      return {
        phase: 'waiting',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id,
          handle: p.handle,
          ready: p.ready,
          connected: p.connected,
        })),
      };

    case 'underway': {
      const n = state.order.length;
      const sheets: ClientSheetView[] = [];

      for (let i = 0; i < state.sheets.length; i++) {
        const sheet = state.sheets[i];
        if (isSheetDone(sheet, n)) continue;

        const assignee = getSheetAssignee(state.order, sheet);
        const assigneePlayer = state.players.get(assignee);
        const handle = assigneePlayer?.handle ?? '';

        if (assignee === playerId) {
          const lastMove = sheet.moves.length > 0
            ? sheet.moves[sheet.moves.length - 1]
            : null;
          sheets.push({
            sheetIndex: i,
            assignedToMe: true,
            assignedToHandle: handle,
            expectedMoveType: getExpectedMoveType(sheet),
            previousMove: lastMove
              ? { type: lastMove.type, content: lastMove.content }
              : null,
            moveCount: sheet.moves.length,
            totalMoves: n,
          });
        } else {
          sheets.push({
            sheetIndex: i,
            assignedToMe: false,
            assignedToHandle: handle,
            moveCount: sheet.moves.length,
            totalMoves: n,
          });
        }
      }

      return {
        phase: 'underway',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id,
          handle: p.handle,
          ready: p.ready,
          connected: p.connected,
        })),
        sheets,
      };
    }

    case 'postgame':
      return {
        phase: 'postgame',
        players: Array.from(state.players.values()).map(p => ({
          id: p.id,
          handle: p.handle,
        })),
        sheets: state.sheets.map((sheet, i) => ({
          sheetIndex: i,
          moves: sheet.moves.map(m => ({
            type: m.type,
            content: m.content,
            playerHandle: state.players.get(m.playerId)?.handle ?? 'Unknown',
          })),
        })),
      };
  }
}

// --- Helpers ---

export function getSheetAssignee(order: PlayerId[], sheet: Sheet): PlayerId {
  const n = order.length;
  return order[(sheet.originIndex + sheet.moves.length) % n];
}

export function getExpectedMoveType(sheet: Sheet): MoveType {
  if (sheet.moves.length % 2 === 0) return sheet.firstMoveType;
  return sheet.firstMoveType === 'text' ? 'drawing' : 'text';
}

export function isSheetDone(sheet: Sheet, playerCount: number): boolean {
  return sheet.moves.length >= playerCount;
}

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
