import type { BwcClientState, ClientMessage } from '../../types';
import { WaitingRoom } from '../WaitingRoom';

type Props = {
  state: BwcClientState;
  playerId: string;
  send: (msg: ClientMessage) => void;
};

export function BwcGame({ state, playerId, send }: Props) {
  switch (state.phase) {
    case 'bwc-waiting':
      return (
        <WaitingRoom
          state={state}
          playerId={playerId}
          onReady={() => send({ type: 'ready' })}
          onUnready={() => send({ type: 'unready' })}
          send={send}
          addWordResult={null}
          clearAddWordResult={() => {}}
        />
      );
  }
}
