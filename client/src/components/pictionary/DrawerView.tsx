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

  const allGuessed = state.correctGuessers.length > 0 &&
    state.players
      .filter(p => p.connected && p.handle !== state.currentDrawerHandle)
      .every(p => p.guessedThisTurn);

  return (
    <div className="pictionary-board">
      {state.lastTurnWord && (
        <div className="pic-last-word">Last word was: <strong>{state.lastTurnWord}</strong></div>
      )}

      <div className="round-info">
        <span>Turn {state.turnNumber} of {state.totalTurns}</span>
        <span className={'timer' + (urgent ? ' timer-urgent' : '')}>{timeLeft}</span>
      </div>

      <div className="pic-secret-word">
        Draw: <strong>{state.word}</strong>
      </div>

      <div className="pic-main-row">
        <div className="pic-main-left">
          <DrawingCanvas
            canvasRef={canvasRef}
            mode="stream"
            onStreamOp={(op: DrawOp) => send(op)}
          />

          {allGuessed && (
            <div className="all-guessed-banner">
              Everyone guessed! Finishing up...
              <button className="submit-btn" onClick={() => send({ type: 'turn-done' })}>Done</button>
            </div>
          )}

          <div className="player-status">
            {state.players.map(p => (
              <span key={p.id} className={'player-chip' + (p.guessedThisTurn ? ' done' : '') + (!p.connected ? ' disconnected' : '')}>
                {p.handle} ({p.score}){p.guessedThisTurn ? ' \u2713' : ''}
              </span>
            ))}
          </div>
        </div>

        <div className="pic-guess-feed">
          {[...guesses].reverse().map((g, i) => (
            <div key={i} className={'pic-guess-entry' + (g.correct ? ' correct' : '')}>
              <strong>{g.handle}</strong>
              {g.correct ? ' guessed correctly!' : `: ${g.text}`}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
