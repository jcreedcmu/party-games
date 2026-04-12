import { useRef, useState, useCallback } from 'react';
import type { DrawOp, ClientMessage, CardId } from '../../types';
import { DrawingCanvas } from '../DrawingCanvas';

type Props = {
  send: (msg: ClientMessage) => void;
  onDone: () => void;
  editingCardId?: CardId;
  initialOps?: DrawOp[];
  initialName?: string;
  initialCardType?: string;
  initialText?: string;
};

export function CardEditor({ send, onDone, editingCardId, initialOps, initialName, initialCardType, initialText }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opsRef = useRef<DrawOp[]>(initialOps ? [...initialOps] : []);
  const [name, setName] = useState(initialName ?? '');
  const [cardType, setCardType] = useState(initialCardType ?? '');
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
        name: name.trim(),
        cardType: cardType.trim(),
        text: text.trim(),
      });
    } else {
      send({
        type: 'bwc-create-card',
        ops: opsRef.current,
        name: name.trim(),
        cardType: cardType.trim(),
        text: text.trim(),
      });
    }
    onDone();
  }

  return (
    <div className="bwc-card-editor">
      <h3>{editingCardId ? 'Edit Card' : 'Create a Card'}</h3>
      <div className="bwc-card-editor-field">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Card Name"
        />
      </div>
      <DrawingCanvas
        canvasRef={canvasRef}
        mode="stream"
        onStreamOp={handleStreamOp}
        initialOps={initialOps}
        canvasWidth={800}
        canvasHeight={600}
      />
      <div className="bwc-card-editor-field">
        <input
          type="text"
          value={cardType}
          onChange={e => setCardType(e.target.value)}
          placeholder="Card Type"
        />
      </div>
      <div className="bwc-card-editor-field">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Rules text"
          rows={4}
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
