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
    case 'bwc-playing':
      // Playing-phase UI lands in step 4 onward.
      return <div>BWC playing-phase view not implemented yet.</div>;
  }
}
