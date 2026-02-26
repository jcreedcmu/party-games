import type { PictionaryClientPostgameState, ClientMessage } from '../../types';
import { LiveCanvas } from './LiveCanvas';

type Props = {
  state: PictionaryClientPostgameState;
  onSend: (msg: ClientMessage) => void;
};

export function PictionaryPostGame({ state, onSend }: Props) {
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <div className="postgame">
      <h2>Final Scores</h2>
      <div className="pic-scoreboard">
        {sortedPlayers.map((p, i) => (
          <div key={p.id} className="pic-score-row">
            <span className="pic-score-rank">#{i + 1}</span>
            <span className="pic-score-name">{p.handle}</span>
            <span className="pic-score-points">{p.score} pts</span>
          </div>
        ))}
      </div>

      <h3>Turns</h3>
      {state.turns.map((turn, i) => (
        <div key={i} className="pic-turn-card">
          <div className="pic-turn-header">
            <strong>{turn.drawerHandle}</strong> drew <strong>&ldquo;{turn.word}&rdquo;</strong>
            {turn.wordAddedBy && (
              <span className="pic-turn-credit">
                {' '}(added by {turn.wordAddedBy}{turn.wordAddedOn && `, ${new Date(turn.wordAddedOn).toLocaleDateString()}`})
              </span>
            )}
          </div>
          <div className="pic-turn-drawing">
            <LiveCanvas ops={turn.drawOps} />
          </div>
          {turn.guessers.length > 0 ? (
            <div className="pic-turn-guessers">
              Guessed by: {turn.guessers.map(g => `${g.handle} (${(g.timeMs / 1000).toFixed(1)}s)`).join(', ')}
            </div>
          ) : (
            <div className="pic-turn-guessers">Nobody guessed it</div>
          )}
        </div>
      ))}

      <button className="submit-btn new-game-btn" onClick={() => onSend({ type: 'reset' })}>
        New Game
      </button>
    </div>
  );
}
