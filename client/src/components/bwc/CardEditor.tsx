import { useRef, useState, useCallback } from 'react';
import type { DrawOp, ClientMessage } from '../../types';
import { DrawingCanvas } from '../DrawingCanvas';

type Props = {
  send: (msg: ClientMessage) => void;
  onDone: () => void;
};

export function CardEditor({ send, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opsRef = useRef<DrawOp[]>([]);
  const [text, setText] = useState('');

  const handleStreamOp = useCallback((op: DrawOp) => {
    opsRef.current.push(op);
  }, []);

  function handleSubmit() {
    send({
      type: 'bwc-create-card',
      ops: opsRef.current,
      text: text.trim(),
    });
    onDone();
  }

  return (
    <div className="bwc-card-editor">
      <h3>Create a Card</h3>
      <DrawingCanvas
        canvasRef={canvasRef}
        mode="stream"
        onStreamOp={handleStreamOp}
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
          Create Card
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
