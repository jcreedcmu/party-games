import { useState, useEffect, useRef } from 'react';
import type { PictionaryClientActiveState, ClientMessage, RelayPayload, DrawOp } from '../../types';
import { LiveCanvas } from './LiveCanvas';

type GuessEntry = {
  handle: string;
  correct: boolean;
  text: string | null;
};

type GuesserViewProps = {
  state: PictionaryClientActiveState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
};

export function GuesserView({ state, playerId, send, onRelay }: GuesserViewProps) {
  const [drawOps, setDrawOps] = useState<DrawOp[]>([]);
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [text, setText] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onRelay((payload) => {
      if (payload.type === 'guess-result') {
        setGuesses(prev => [...prev, {
          handle: payload.handle,
          correct: payload.correct,
          text: payload.text,
        }]);
      } else {
        setDrawOps(prev => [...prev, payload as DrawOp]);
      }
    });
  }, [onRelay]);

  useEffect(() => {
    function tick() {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((state.turnDeadline - now) / 1000));
      setTimeLeft(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);
      setUrgent(remaining <= 10 && remaining > 0);
      setHintRevealed(now >= state.hintRevealTime);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.turnDeadline]);

  function submitGuess() {
    const trimmed = text.trim();
    if (!trimmed || state.guessedCorrectly) return;
    send({ type: 'guess', text: trimmed });
    setText('');
    inputRef.current?.focus();
  }

  return (
    <div className="pictionary-board">
      {state.lastTurnWord && (
        <div className="pic-last-word">Last word was: <strong>{state.lastTurnWord}</strong></div>
      )}

      <div className="round-info">
        <span>Turn {state.turnNumber} of {state.totalTurns}</span>
        <span className={'timer' + (urgent ? ' timer-urgent' : '')}>{timeLeft}</span>
        <span>{state.currentDrawerHandle} is drawing</span>
      </div>

      <div className="pic-canvas-area">
        <LiveCanvas ops={drawOps} />
      </div>

      <div className="pic-word-hint">{hintRevealed ? state.wordHintRevealed : state.wordHint}</div>

      {state.guessedCorrectly ? (
        <div className="pic-guessed-correct">You guessed it!</div>
      ) : (
        <form className="pic-guess-form" onSubmit={(e) => { e.preventDefault(); submitGuess(); }}>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your guess..."
            autoFocus
          />
          <button type="submit">Guess</button>
        </form>
      )}

      <div className="pic-guess-feed">
        {[...guesses].reverse().map((g, i) => (
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
