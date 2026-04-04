import { useState, useEffect } from 'react';
import type { PictionaryClientState, PictionaryClientWaitingState, ClientMessage, RelayPayload } from '../../types';
import { WaitingRoom } from '../WaitingRoom';
import { PictionaryBoard } from './PictionaryBoard';
import { PictionaryPostGame } from './PictionaryPostGame';
import { AddWordForm } from './AddWordForm';

type AddWordResult = { success: boolean; message: string } | null;

type Props = {
  state: PictionaryClientState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
  addWordResult: AddWordResult;
  clearAddWordResult: () => void;
};

export function PictionaryGame({ state, playerId, send, onRelay, addWordResult, clearAddWordResult }: Props) {
  const [showLobby, setShowLobby] = useState(false);

  useEffect(() => {
    if (state.phase !== 'pictionary-postgame') {
      setShowLobby(false);
    }
  }, [state.phase]);

  switch (state.phase) {
    case 'pictionary-waiting':
      return (
        <WaitingRoom
          state={state}
          playerId={playerId}
          onReady={() => send({ type: 'ready' })}
          onUnready={() => send({ type: 'unready' })}
          send={send}
          addWordResult={addWordResult}
          clearAddWordResult={clearAddWordResult}
        />
      );
    case 'pictionary-active':
      return (
        <div className="pic-board-layout">
          <div className="card">
            <PictionaryBoard state={state} playerId={playerId} send={send} onRelay={onRelay} />
          </div>
          <AddWordForm send={send} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} />
        </div>
      );
    case 'pictionary-postgame':
      if (showLobby) {
        const waitingState: PictionaryClientWaitingState = {
          phase: 'pictionary-waiting',
          players: state.players.map(p => ({
            id: p.id,
            handle: p.handle,
            ready: p.ready,
            connected: p.connected,
          })),
        };
        return (
          <WaitingRoom
            state={waitingState}
            playerId={playerId}
            onReady={() => send({ type: 'ready' })}
            onUnready={() => send({ type: 'unready' })}
            send={send}
            addWordResult={addWordResult}
            clearAddWordResult={clearAddWordResult}
          />
        );
      }
      return <PictionaryPostGame state={state} onNewGame={() => setShowLobby(true)} />;
  }
}
