import { useState } from 'react';
import type { ClientPostgameState } from '../types';

type PostGameProps = {
  state: ClientPostgameState;
};

export function PostGame({ state }: PostGameProps) {
  const [currentSheet, setCurrentSheet] = useState(0);
  const sheet = state.sheets[currentSheet];

  return (
    <div className="postgame">
      <div className="sheet-tabs">
        {state.sheets.map((_, i) => (
          <button
            key={i}
            className={'sheet-tab' + (i === currentSheet ? ' active' : '')}
            onClick={() => setCurrentSheet(i)}
          >
            Sheet {i + 1}
          </button>
        ))}
      </div>

      <div className="sheet-viewer">
        {sheet.moves.map((move, i) => (
          <div key={i} className="sheet-move">
            <div className="move-author">
              {move ? move.playerHandle : 'Nobody'}
            </div>
            {move === null ? (
              <div className="move-content move-skipped">(no submission)</div>
            ) : move.type === 'text' ? (
              <div className="move-content move-text">{move.content}</div>
            ) : (
              <div className="move-content move-drawing">
                <img src={move.content} alt={`Drawing by ${move.playerHandle}`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
