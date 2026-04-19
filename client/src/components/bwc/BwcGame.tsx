import { useState } from 'react';
import type { BwcClientState, BwcClientPlayingState, ClientMessage, CardId, DrawOp, Side } from '../../types';
import { WaitingRoom } from '../WaitingRoom';
import { Modal } from '../Modal';
import { CardEditor } from './CardEditor';
import { CardLibraryPanel } from './CardLibraryPanel';
import { BwcPlayArea } from './BwcPlayArea';

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; cardId: CardId; ops: DrawOp[]; name: string; cardType: string; text: string };

type Props = {
  state: BwcClientState;
  playerId: string;
  send: (msg: ClientMessage) => void;
};

function BwcPlaying({ state, playerId, send }: { state: BwcClientPlayingState; playerId: string; send: (msg: ClientMessage) => void }) {
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [showLibrary, setShowLibrary] = useState(false);
  const mySide: Side = state.seats.find(s => s.seat === state.mySeat)?.side ?? 'S';

  function handleEdit(cardId: CardId, ops: DrawOp[], name: string, cardType: string, text: string) {
    setEditor({ mode: 'edit', cardId, ops, name, cardType, text });
  }

  const base = import.meta.env.BASE_URL;

  return (
    <div className="bwc-page">
      <div className="bwc-topbar">
        <img src={`${base}1kbwc-titlebar.png`} alt="1000 Blank White Cards" className="bwc-topbar-logo" />
      </div>
      <div className="bwc-body">
        <div className="bwc-main">
          <BwcPlayArea
            table={state.table}
            myHand={state.myHand}
            seats={state.seats}
            mySide={mySide}
            playerId={playerId}
            send={send}
            onEdit={handleEdit}
          />
        </div>
        <div className="bwc-sidebar">
          <button onClick={() => setEditor(e => e.mode === 'create' ? { mode: 'closed' } : { mode: 'create' })}>
            {editor.mode === 'create' ? 'Close Editor' : 'New Card'}
          </button>
          <button onClick={() => setShowLibrary(l => !l)}>
            {showLibrary ? 'Hide Library' : `Library (${state.library.length})`}
          </button>
          <button onClick={() => send({ type: 'bwc-tidy-hand' })}>
            Tidy Hand (T)
          </button>
          <button onClick={() => send({ type: 'reset' })}>
            Reset
          </button>
          {showLibrary && (
            <CardLibraryPanel cards={state.library} canSpawn mySide={mySide} send={send} onEdit={handleEdit} />
          )}
        </div>
      </div>
      {editor.mode !== 'closed' && (
        <Modal onClose={() => setEditor({ mode: 'closed' })}>
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
              initialName={editor.name}
              initialCardType={editor.cardType}
              initialText={editor.text}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

export function BwcGame({ state, playerId, send }: Props) {
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });

  function handleEdit(cardId: CardId, ops: DrawOp[], name: string, cardType: string, text: string) {
    setEditor({ mode: 'edit', cardId, ops, name, cardType, text });
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
          <button className="btn-primary" onClick={() => setEditor({ mode: 'create' })}>
            New Card
          </button>
          <CardLibraryPanel cards={state.library} onEdit={handleEdit} />
          {editor.mode !== 'closed' && (
            <Modal onClose={() => setEditor({ mode: 'closed' })}>
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
            </Modal>
          )}
        </div>
      );
    case 'bwc-playing':
      return <BwcPlaying state={state} playerId={playerId} send={send} />;
  }
}
