import { useState, useRef } from 'react';
import type { BwcClientState, BwcClientPlayingState, ClientMessage, CardId, DrawOp } from '../../types';
import { WaitingRoom } from '../WaitingRoom';
import { CardEditor } from './CardEditor';
import { CardLibraryPanel } from './CardLibraryPanel';
import { BwcTable } from './BwcTable';
import { HandTray } from './HandTray';

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; cardId: CardId; ops: DrawOp[]; text: string };

type Props = {
  state: BwcClientState;
  playerId: string;
  send: (msg: ClientMessage) => void;
};

function BwcPlaying({ state, playerId, send }: { state: BwcClientPlayingState; playerId: string; send: (msg: ClientMessage) => void }) {
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [showLibrary, setShowLibrary] = useState(false);
  const mySide = state.seats.find(s => s.seat === state.mySeat)?.side ?? 'S';

  function handleEdit(cardId: CardId, ops: DrawOp[], text: string) {
    setEditor({ mode: 'edit', cardId, ops, text });
  }

  return (
    <div className="bwc-playing">
      <div className="bwc-playing-toolbar">
        <button onClick={() => setEditor(e => e.mode === 'create' ? { mode: 'closed' } : { mode: 'create' })}>
          {editor.mode === 'create' ? 'Close Editor' : 'New Card'}
        </button>
        <button onClick={() => setShowLibrary(l => !l)}>
          {showLibrary ? 'Hide Library' : `Library (${state.library.length})`}
        </button>
        <button onClick={() => send({ type: 'reset' })}>
          Reset
        </button>
      </div>
      {editor.mode === 'create' && (
        <CardEditor
          key="create"
          send={send}
          onDone={() => setEditor({ mode: 'closed' })}
        />
      )}
      {editor.mode === 'edit' && (
        <CardEditor
          key={`edit-${editor.cardId}`}
          send={send}
          onDone={() => setEditor({ mode: 'closed' })}
          editingCardId={editor.cardId}
          initialOps={editor.ops}
          initialText={editor.text}
        />
      )}
      {showLibrary && (
        <CardLibraryPanel cards={state.library} canSpawn mySide={mySide} send={send} onEdit={handleEdit} />
      )}
      <BwcTable
        table={state.table}
        library={state.library}
        seats={state.seats}
        mySide={mySide}
        send={send}
      />
      <HandTray
        hand={state.myHand}
        playerId={playerId}
        mySide={mySide}
        send={send}
      />
    </div>
  );
}

export function BwcGame({ state, playerId, send }: Props) {
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });

  function handleEdit(cardId: CardId, ops: DrawOp[], text: string) {
    setEditor({ mode: 'edit', cardId, ops, text });
  }

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
          {editor.mode === 'closed' && (
            <button className="btn-primary" onClick={() => setEditor({ mode: 'create' })}>
              New Card
            </button>
          )}
          {editor.mode === 'create' && (
            <CardEditor
              key="create"
              send={send}
              onDone={() => setEditor({ mode: 'closed' })}
            />
          )}
          {editor.mode === 'edit' && (
            <CardEditor
              key={`edit-${editor.cardId}`}
              send={send}
              onDone={() => setEditor({ mode: 'closed' })}
              editingCardId={editor.cardId}
              initialOps={editor.ops}
              initialText={editor.text}
            />
          )}
          <CardLibraryPanel cards={state.library} onEdit={handleEdit} />
        </div>
      );
    case 'bwc-playing':
      return <BwcPlaying state={state} playerId={playerId} send={send} />;
  }
}
