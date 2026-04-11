import { useState } from 'react';
import type { BwcClientState, BwcClientPlayingState, ClientMessage } from '../../types';
import { WaitingRoom } from '../WaitingRoom';
import { CardEditor } from './CardEditor';
import { CardLibraryPanel } from './CardLibraryPanel';
import { BwcTable } from './BwcTable';

type Props = {
  state: BwcClientState;
  playerId: string;
  send: (msg: ClientMessage) => void;
};

function BwcPlaying({ state, send }: { state: BwcClientPlayingState; send: (msg: ClientMessage) => void }) {
  const [showEditor, setShowEditor] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  return (
    <div className="bwc-playing">
      <div className="bwc-playing-toolbar">
        <button onClick={() => setShowEditor(e => !e)}>
          {showEditor ? 'Close Editor' : 'New Card'}
        </button>
        <button onClick={() => setShowLibrary(l => !l)}>
          {showLibrary ? 'Hide Library' : `Library (${state.library.length})`}
        </button>
        <button onClick={() => send({ type: 'reset' })}>
          Reset
        </button>
      </div>
      {showEditor && (
        <CardEditor send={send} onDone={() => setShowEditor(false)} />
      )}
      {showLibrary && (
        <CardLibraryPanel cards={state.library} canSpawn send={send} />
      )}
      <BwcTable table={state.table} library={state.library} send={send} />
    </div>
  );
}

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
      return <BwcPlaying state={state} send={send} />;
  }
}
