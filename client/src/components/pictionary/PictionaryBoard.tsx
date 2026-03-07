import type { PictionaryClientActiveState, ClientMessage, RelayPayload } from '../../types';
import { DrawerView } from './DrawerView';
import { GuesserView } from './GuesserView';
import { WordPicker } from './WordPicker';

type PictionaryBoardProps = {
  state: PictionaryClientActiveState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
};

export function PictionaryBoard({ state, playerId, send, onRelay }: PictionaryBoardProps) {
  if (state.subPhase === 'picking') {
    if (state.role === 'drawer') {
      return <WordPicker state={state} send={send} />;
    }
    return (
      <div className="pictionary-board" data-testid="pictionary-board">
        <div className="round-info">
          <span>Turn {state.turnNumber} of {state.totalTurns}</span>
        </div>
        <div className="pic-picking-wait" data-testid="picking-wait">
          <p>{state.currentDrawerHandle} is picking a word...</p>
        </div>
      </div>
    );
  }

  if (state.role === 'drawer') {
    return <DrawerView key={state.turnNumber} state={state} send={send} onRelay={onRelay} />;
  }
  return <GuesserView key={state.turnNumber} state={state} playerId={playerId} send={send} onRelay={onRelay} />;
}
