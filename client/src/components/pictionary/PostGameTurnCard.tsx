import { useState } from 'react';
import type { PictionaryClientTurnSummary } from '../../types';
import { LiveCanvas } from './LiveCanvas';

type Props = {
  turn: PictionaryClientTurnSummary;
};

export function PostGameTurnCard({ turn }: Props) {
  const [playing, setPlaying] = useState(false);
  const hasTimestamps = turn.drawOps.length > 0 && turn.drawOps[0].t != null;

  return (
    <div className="pic-turn-card">
      <div className="pic-turn-header">
        <strong>{turn.drawerHandle}</strong> drew <strong>&ldquo;{turn.word}&rdquo;</strong>
        {turn.wordAddedBy && (
          <span className="pic-turn-credit">
            {' '}(added by {turn.wordAddedBy}{turn.wordAddedOn && `, ${new Date(turn.wordAddedOn).toLocaleDateString()}`})
          </span>
        )}
      </div>
      <div className="pic-turn-body">
        <div className="pic-turn-drawing">
          <LiveCanvas ops={turn.drawOps} animated playing={playing} />
        </div>
        <div className="pic-turn-guess-log-wrapper">
          <div className="pic-turn-guess-log">
            {turn.guessLog.map((g, j) => (
              <div key={j} className={'pic-guess-entry' + (g.correct ? ' correct' : '')}>
                <strong>{g.handle}</strong>
                {g.correct ? ' guessed correctly!' : `: ${g.text}`}
              </div>
            ))}
            {turn.guessLog.length === 0 && (
              <div className="pic-turn-no-guesses">No guesses</div>
            )}
          </div>
        </div>
      </div>
      <div className="pic-turn-guessers">
        <span>
          {turn.guessers.length > 0
            ? `Guessed by: ${turn.guessers.map(g => `${g.handle} (${(g.timeMs / 1000).toFixed(1)}s)`).join(', ')}`
            : 'Nobody guessed it'}
        </span>
        {hasTimestamps && (
          <button
            className="live-canvas-play-btn"
            onClick={() => setPlaying(p => !p)}
            title={playing ? 'Stop' : 'Play'}
          >
            {playing ? 'Stop' : 'Play'}
          </button>
        )}
      </div>
    </div>
  );
}
