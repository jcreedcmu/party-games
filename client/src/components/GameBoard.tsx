import type { ClientUnderwayState, ClientMessage } from '../types';
import { SheetCard } from './SheetCard';

type GameBoardProps = {
  state: ClientUnderwayState;
  playerId: string;
  onSend: (msg: ClientMessage) => void;
};

export function GameBoard({ state, playerId, onSend }: GameBoardProps) {
  const mySheets = state.sheets.filter(s => s.assignedToMe);
  const otherSheets = state.sheets.filter(s => !s.assignedToMe);

  return (
    <div className="game-board">
      {mySheets.length > 0 ? (
        <>
          <h2>Your Sheets</h2>
          <div className="sheet-row">
            {mySheets.map(sheet => (
              <SheetCard key={sheet.sheetIndex} sheet={sheet} onSend={onSend} />
            ))}
          </div>
        </>
      ) : (
        <p className="waiting-message">Waiting for other players to finish their sheets...</p>
      )}
      {otherSheets.length > 0 && (
        <>
          <h3>Other Sheets</h3>
          <div className="sheet-row">
            {otherSheets.map(sheet => (
              <SheetCard key={sheet.sheetIndex} sheet={sheet} onSend={onSend} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
