import { useRef, useState, useEffect, useCallback } from 'react';
import type { DrawOp, ClientMessage, CardId } from '../../types';
import { DrawingCanvas } from '../DrawingCanvas';
import { putOps } from '../../image-cache';
import { fetchCardOps, getCachedOps } from '../../card-ops';

type Props = {
  send: (msg: ClientMessage) => void;
  onDone: () => void;
  editingCardId?: CardId;
  editingOpsHash?: string;
  initialName?: string;
  initialCardType?: string;
  initialText?: string;
};

// The art of the card being edited is not in the state broadcast; it is
// fetched by hash. Holding the editor body back until it arrives keeps
// `DrawingCanvas` mounting once, with its ops already known.
export function CardEditor(props: Props) {
  const { editingCardId, editingOpsHash } = props;
  const [initialOps, setInitialOps] = useState<DrawOp[] | null>(
    editingOpsHash ? getCachedOps(editingOpsHash) ?? null : [],
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initialOps || !editingCardId || !editingOpsHash) return;
    let live = true;
    fetchCardOps(editingCardId, editingOpsHash).then(
      ops => { if (live) setInitialOps(ops); },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [editingCardId, editingOpsHash, initialOps]);

  if (initialOps === null) {
    return (
      <div className="bwc-card-editor">
        <h3>Edit Card</h3>
        <p>{failed ? 'Could not load this card’s art.' : 'Loading art…'}</p>
        <div className="bwc-card-editor-actions">
          <button onClick={props.onDone}>Cancel</button>
        </div>
      </div>
    );
  }
  return <CardEditorBody {...props} initialOps={initialOps} />;
}

function CardEditorBody({
  send, onDone, editingCardId, initialOps, initialName, initialCardType, initialText,
}: Props & { initialOps: DrawOp[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opsRef = useRef<DrawOp[]>([...initialOps]);
  const [name, setName] = useState(initialName ?? '');
  const [cardType, setCardType] = useState(initialCardType ?? '');
  const [text, setText] = useState(initialText ?? '');

  const handleStreamOp = useCallback((op: DrawOp) => {
    opsRef.current.push(op);
  }, []);

  function handleSubmit() {
    // Cache the current canvas image so we don't need to replay ops
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      putOps(opsRef.current, imageData);
    }

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
