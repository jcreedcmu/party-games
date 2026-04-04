import { useState } from 'react';
import type { ClientMessage } from '../../types';

type AddWordResult = { success: boolean; message: string } | null;

type Props = {
  send: (msg: ClientMessage) => void;
  addWordResult: AddWordResult;
  clearAddWordResult: () => void;
};

export function AddWordForm({ send, addWordResult, clearAddWordResult }: Props) {
  const [newWord, setNewWord] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newWord.trim();
    if (!trimmed) return;
    send({ type: 'add-word', word: trimmed });
    setNewWord('');
  }

  return (
    <div className="add-word-sidebar">
      <h3>Add a Word</h3>
      <form className="add-word-form" onSubmit={handleSubmit}>
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
  );
}
