import { useState, useEffect } from 'react';
import type { PictionaryClientActiveState, ClientMessage, RelayPayload } from '../../types';
import { DrawerView } from './DrawerView';
import { GuesserView } from './GuesserView';
import { WordPicker } from './WordPicker';
type PictionaryBoardProps = {
  state: PictionaryClientActiveState;
  playerId: string;
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
};

function RevealView({ state }: { state: PictionaryClientActiveState }) {
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, Math.ceil((state.turnDeadline - Date.now()) / 1000))
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((state.turnDeadline - Date.now()) / 1000)));
    }, 200);
    return () => clearInterval(id);
  }, [state.turnDeadline]);

  const guessedCount = state.correctGuessers.length;
  const totalGuessers = state.players.filter(p => p.connected && p.id !== state.players.find(pp => pp.handle === state.currentDrawerHandle)?.id).length;

  return (
    <div className="pictionary-board" data-testid="reveal-view">
      <div className="round-info">
        <span>Turn {state.turnNumber} of {state.totalTurns}</span>
        <span className="timer">{timeLeft}</span>
      </div>
      <div className="pic-reveal">
        <div className="pic-reveal-word">
          The word was: <strong>{state.word}</strong>
        </div>
        <div className="pic-reveal-drawn-by">
          Drawn by <strong>{state.currentDrawerHandle}</strong>
        </div>
        <div className="pic-reveal-stats">
          {guessedCount === 0
            ? 'Nobody guessed it!'
            : guessedCount === totalGuessers
              ? 'Everyone guessed it!'
              : `${guessedCount} of ${totalGuessers} guessed it`}
        </div>
      </div>
    </div>
  );
}

export function PictionaryBoard({ state, playerId, send, onRelay }: PictionaryBoardProps) {
  let content;

  if (state.subPhase === 'reveal') {
    content = <RevealView state={state} />;
  } else if (state.subPhase === 'picking') {
    if (state.role === 'drawer') {
      content = <WordPicker state={state} send={send} />;
    } else {
      content = (
        <div className="pictionary-board" data-testid="pictionary-board">
          <div className="round-info">
            <span>Turn {state.turnNumber} of {state.totalTurns}</span>
          </div>
          <div className="pic-picking-wait" data-testid="picking-wait">
            <p>{state.currentDrawerHandle} is picking a word...</p>
          </div>
        </div>
      );
    }
  } else if (state.role === 'drawer') {
    content = <DrawerView key={state.turnNumber} state={state} send={send} onRelay={onRelay} />;
  } else {
    content = <GuesserView key={state.turnNumber} state={state} playerId={playerId} send={send} onRelay={onRelay} />;
  }

  return content;
}
