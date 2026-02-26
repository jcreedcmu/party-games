import type { MoveType } from '../../types';

type PreviousMoveProps = {
  move: { type: MoveType; content: string };
};

export function PreviousMove({ move }: PreviousMoveProps) {
  if (move.type === 'text') {
    return <div className="previous-move previous-move-text">{move.content}</div>;
  }
  return (
    <div className="previous-move previous-move-drawing">
      <img src={move.content} alt="Previous drawing" />
    </div>
  );
}
