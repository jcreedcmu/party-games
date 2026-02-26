import { useState, useEffect, useRef } from 'react';
import type { PictionaryClientActiveState, ClientMessage, RelayPayload, DrawOp } from '../../types';
import { DrawingCanvas } from '../DrawingCanvas';

type GuessEntry = {
  handle: string;
  correct: boolean;
  text: string | null;
};

type DrawerViewProps = {
  state: PictionaryClientActiveState;
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
};

export function DrawerView({ state, send, onRelay }: DrawerViewProps) {
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [timeLeft, setTimeLeft] = useState('');
  const [urgent, setUrgent] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return onRelay((payload) => {
      if (payload.type === 'guess-result') {
        setGuesses(prev => [...prev, {
          handle: payload.handle,
          correct: payload.correct,
          text: payload.text,
        }]);
      }
    });
  }, [onRelay]);

  useEffect(() => {
    function tick() {
      const remaining = Math.max(0, Math.ceil((state.turnDeadline - Date.now()) / 1000));
      setTimeLeft(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);
      setUrgent(remaining <= 10 && remaining > 0);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.turnDeadline]);

  return (
    <div className="pictionary-board">
      <div className="round-info">
        <span>Turn {state.turnNumber} of {state.totalTurns}</span>
        <span className={'timer' + (urgent ? ' timer-urgent' : '')}>{timeLeft}</span>
      </div>

      <div className="pic-secret-word">
        Draw: <strong>{state.word}</strong>
      </div>

      <DrawingCanvas
        canvasRef={canvasRef}
        mode="stream"
        onStreamOp={(op: DrawOp) => send(op)}
      />

      <div className="pic-guess-feed">
        {guesses.map((g, i) => (
          <div key={i} className={'pic-guess-entry' + (g.correct ? ' correct' : '')}>
            <strong>{g.handle}</strong>
            {g.correct ? ' guessed correctly!' : `: ${g.text}`}
          </div>
        ))}
      </div>

      <div className="player-status">
        {state.players.map(p => (
          <span key={p.id} className={'player-chip' + (p.guessedThisTurn ? ' done' : '') + (!p.connected ? ' disconnected' : '')}>
            {p.handle} ({p.score}){p.guessedThisTurn ? ' \u2713' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
