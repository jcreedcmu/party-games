import type { ClientSheetView, ClientMessage } from '../types';
import { PreviousMove } from './PreviousMove';
import { TextInput } from './TextInput';

type SheetCardProps = {
  sheet: ClientSheetView;
  onSend: (msg: ClientMessage) => void;
};

export function SheetCard({ sheet, onSend }: SheetCardProps) {
  if (!sheet.assignedToMe) {
    return (
      <div className="sheet-card sheet-card-other">
        <div className="sheet-status">
          Waiting on <strong>{sheet.assignedToHandle}</strong>
        </div>
        <div className="sheet-progress">{sheet.moveCount} / {sheet.totalMoves}</div>
      </div>
    );
  }

  function handleTextSubmit(text: string) {
    onSend({
      type: 'submit',
      sheetIndex: sheet.sheetIndex,
      move: { type: 'text', content: text },
    });
  }

  return (
    <div className="sheet-card sheet-card-mine">
      {sheet.previousMove && <PreviousMove move={sheet.previousMove} />}
      {sheet.expectedMoveType === 'text' ? (
        <TextInput onSubmit={handleTextSubmit} />
      ) : (
        <div className="drawing-placeholder">Drawing canvas (coming soon)</div>
      )}
      <div className="sheet-progress">{sheet.moveCount} / {sheet.totalMoves}</div>
    </div>
  );
}
