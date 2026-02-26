import { useState } from 'react';
import type { EpycClientWaitingState, PictionaryClientWaitingState, ClientMessage } from '../types';

type AddWordResult = { success: boolean; message: string } | null;

type WaitingRoomProps = {
  state: EpycClientWaitingState | PictionaryClientWaitingState;
  playerId: string;
  onReady: () => void;
  onUnready: () => void;
  send: (msg: ClientMessage) => void;
  addWordResult: AddWordResult;
  clearAddWordResult: () => void;
};

export function WaitingRoom({ state, playerId, onReady, onUnready, send, addWordResult, clearAddWordResult }: WaitingRoomProps) {
  const me = state.players.find(p => p.id === playerId);
  const isReady = me?.ready ?? false;
  const isPictionary = state.phase === 'pictionary-waiting';
  const [newWord, setNewWord] = useState('');

  function handleAddWord(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newWord.trim();
    if (!trimmed) return;
    send({ type: 'add-word', word: trimmed });
    setNewWord('');
  }

  return (
    <div className="waiting-room">
      <h2>Waiting Room</h2>
      <ul className="player-list">
        {state.players.map(p => (
          <li key={p.id} className={p.id === playerId ? 'me' : ''}>
            <span className="player-name">{p.handle}</span>
            {p.ready && <span className="ready-indicator"> ✓</span>}
          </li>
        ))}
      </ul>
      <button className="btn-primary" onClick={isReady ? onUnready : onReady}>
        {isReady ? 'Not Ready' : 'Ready'}
      </button>

      {isPictionary && (
        <div className="add-word-section">
          <h3>Add a Word</h3>
          <form className="add-word-form" onSubmit={handleAddWord}>
            <input
              type="text"
              value={newWord}
              onChange={(e) => { setNewWord(e.target.value); clearAddWordResult(); }}
              placeholder="New word or phrase..."
            />
            <button type="submit" disabled={!newWord.trim()}>Add</button>
          </form>
          {addWordResult && (
            <div className={addWordResult.success ? 'add-word-success' : 'add-word-error'}>
              {addWordResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
