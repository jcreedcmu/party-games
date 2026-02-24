import { useState, useEffect } from 'react';
import type { ClientUnderwayState, ClientMessage } from '../types';
import { PreviousMove } from './PreviousMove';
import { TextInput } from './TextInput';
import { DrawingCanvas } from './DrawingCanvas';

type GameBoardProps = {
  state: ClientUnderwayState;
  playerId: string;
  onSend: (msg: ClientMessage) => void;
};

export function GameBoard({ state, playerId, onSend }: GameBoardProps) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    function tick() {
      const remaining = Math.max(0, Math.ceil((state.roundDeadline - Date.now()) / 1000));
      setTimeLeft(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.roundDeadline]);

  function handleTextSubmit(text: string) {
    onSend({ type: 'submit', move: { type: 'text', content: text } });
  }

  function handleDrawingSubmit(dataUrl: string) {
    onSend({ type: 'submit', move: { type: 'drawing', content: dataUrl } });
  }

  const submittedCount = state.players.filter(p => p.submitted).length;

  return (
    <div className="game-board">
      <div className="round-info">
        <span>Round {state.currentRound + 1} of {state.totalRounds}</span>
        <span className="timer">{timeLeft}</span>
        <span>{submittedCount} / {state.players.length} submitted</span>
      </div>

      {state.submitted ? (
        <div className="submitted-message">
          Submitted! Waiting for other players...
        </div>
      ) : (
        <div className="sheet-card sheet-card-mine">
          {state.previousMove && <PreviousMove move={state.previousMove} />}
          {state.expectedMoveType === 'text' ? (
            <TextInput onSubmit={handleTextSubmit} />
          ) : (
            <DrawingCanvas onSubmit={handleDrawingSubmit} />
          )}
        </div>
      )}

      <div className="player-status">
        {state.players.map(p => (
          <span key={p.id} className={'player-chip' + (p.submitted ? ' done' : '') + (!p.connected ? ' disconnected' : '')}>
            {p.handle}{p.submitted ? ' ✓' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
