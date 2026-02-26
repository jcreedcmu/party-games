import type { PictionaryClientActiveState, ClientMessage, RelayPayload } from '../../types';
import { DrawerView } from './DrawerView';
import { GuesserView } from './GuesserView';

type PictionaryBoardProps = {
  state: PictionaryClientActiveState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
};

export function PictionaryBoard({ state, playerId, send, onRelay }: PictionaryBoardProps) {
  if (state.role === 'drawer') {
    return <DrawerView key={state.turnNumber} state={state} send={send} onRelay={onRelay} />;
  }
  return <GuesserView key={state.turnNumber} state={state} playerId={playerId} send={send} onRelay={onRelay} />;
}
