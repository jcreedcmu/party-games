import { useState } from 'react';
import type { BwcClientState, ClientMessage } from '../../types';
import { WaitingRoom } from '../WaitingRoom';
import { CardEditor } from './CardEditor';
import { CardLibraryPanel } from './CardLibraryPanel';

type Props = {
  state: BwcClientState;
  playerId: string;
  send: (msg: ClientMessage) => void;
};

export function BwcGame({ state, playerId, send }: Props) {
  const [showEditor, setShowEditor] = useState(false);

  switch (state.phase) {
    case 'bwc-waiting':
      return (
        <div>
          <WaitingRoom
            state={state}
            playerId={playerId}
            onReady={() => send({ type: 'ready' })}
            onUnready={() => send({ type: 'unready' })}
            send={send}
            addWordResult={null}
            clearAddWordResult={() => {}}
          />
          {showEditor ? (
            <CardEditor send={send} onDone={() => setShowEditor(false)} />
          ) : (
            <button className="btn-primary" onClick={() => setShowEditor(true)}>
              New Card
            </button>
          )}
          <CardLibraryPanel cards={state.library} />
        </div>
      );
    case 'bwc-playing':
      return <div>BWC playing-phase view not implemented yet.</div>;
  }
}
