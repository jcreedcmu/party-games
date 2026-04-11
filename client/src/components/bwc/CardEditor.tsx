import { useRef, useState, useCallback } from 'react';
import type { DrawOp, ClientMessage, CardId } from '../../types';
import { DrawingCanvas } from '../DrawingCanvas';

type Props = {
  send: (msg: ClientMessage) => void;
  onDone: () => void;
  // If editing an existing card, provide these:
  editingCardId?: CardId;
  initialOps?: DrawOp[];
  initialText?: string;
};

export function CardEditor({ send, onDone, editingCardId, initialOps, initialText }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opsRef = useRef<DrawOp[]>(initialOps ? [...initialOps] : []);
  const [text, setText] = useState(initialText ?? '');

  const handleStreamOp = useCallback((op: DrawOp) => {
    opsRef.current.push(op);
  }, []);

  function handleSubmit() {
    if (editingCardId) {
      send({
        type: 'bwc-edit-card',
        cardId: editingCardId,
        ops: opsRef.current,
        text: text.trim(),
      });
    } else {
      send({
        type: 'bwc-create-card',
        ops: opsRef.current,
        text: text.trim(),
      });
    }
    onDone();
  }

  return (
    <div className="bwc-card-editor">
      <h3>{editingCardId ? 'Edit Card' : 'Create a Card'}</h3>
      <DrawingCanvas
        canvasRef={canvasRef}
        mode="stream"
        onStreamOp={handleStreamOp}
        initialOps={initialOps}
      />
      <div className="bwc-card-editor-text">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Card text (rules, effects, etc.)"
          rows={3}
        />
      </div>
      <div className="bwc-card-editor-actions">
        <button className="btn-primary" onClick={handleSubmit}>
          {editingCardId ? 'Save' : 'Create Card'}
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
