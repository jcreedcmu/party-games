import { useState, useEffect } from 'react';
import type { PictionaryClientActiveState, ClientMessage } from '../../types';

type WordPickerProps = {
  state: PictionaryClientActiveState;
  send: (msg: ClientMessage) => void;
};

export function WordPicker({ state, send }: WordPickerProps) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    function tick() {
      const remaining = Math.max(0, Math.ceil((state.turnDeadline - Date.now()) / 1000));
      setTimeLeft(`${remaining}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.turnDeadline]);

  return (
    <div className="pictionary-board">
      <div className="round-info">
        <span>Turn {state.turnNumber} of {state.totalTurns}</span>
        <span className="timer">{timeLeft}</span>
      </div>
      <div className="pic-word-picker">
        <h3>Pick a word to draw:</h3>
        <div className="pic-word-choices">
          {state.wordChoices?.map((word, i) => (
            <button
              key={i}
              className="pic-word-choice-btn"
              onClick={() => send({ type: 'pick-word', index: i })}
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
