import type { EpycClientState, ClientMessage } from '../../types';
import { WaitingRoom } from '../WaitingRoom';
import { GameBoard } from './GameBoard';
import { PostGame } from './PostGame';

type AddWordResult = { success: boolean; message: string } | null;

type Props = {
  state: EpycClientState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  addWordResult: AddWordResult;
  clearAddWordResult: () => void;
};

export function EpycGame({ state, playerId, send, addWordResult, clearAddWordResult }: Props) {
  switch (state.phase) {
    case 'epyc-waiting':
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
    case 'epyc-underway':
      return <GameBoard state={state} playerId={playerId} onSend={send} />;
    case 'epyc-postgame':
      return <PostGame state={state} onSend={send} />;
  }
}
