import type { PictionaryClientPostgameState } from '../../types';
import { PostGameTurnCard } from './PostGameTurnCard';

type Props = {
  state: PictionaryClientPostgameState;
  onNewGame: () => void;
};

export function PictionaryPostGame({ state, onNewGame }: Props) {
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <div className="postgame" data-testid="postgame">
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
        <PostGameTurnCard key={i} turn={turn} />
      ))}

      <button className="submit-btn new-game-btn" onClick={onNewGame}>
        New Game
      </button>
    </div>
  );
}
