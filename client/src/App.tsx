import { useRef } from 'react';
import { useSocket } from './hooks/useSocket';
import { JoinDialog } from './components/JoinDialog';
import { EpycGame } from './components/epyc/EpycGame';
import { PictionaryGame } from './components/pictionary/PictionaryGame';
import { DrawingCanvas } from './components/DrawingCanvas';
import type { EpycClientState, PictionaryClientState } from './types';

function DebugDraw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  return (
    <div className="app">
      <h1>Drawing Canvas Debug</h1>
      <div className="sheet-card" style={{ maxWidth: 480 }}>
        <DrawingCanvas canvasRef={canvasRef} onSubmit={() => {
          const dataUrl = canvasRef.current?.toDataURL('image/png');
          console.log('Submitted drawing, data URL length:', dataUrl?.length);
        }} />
      </div>
    </div>
  );
}

function DebugStream() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  return (
    <div className="app">
      <h1>Stream Mode Debug</h1>
      <div className="sheet-card" style={{ maxWidth: 480 }}>
        <DrawingCanvas canvasRef={canvasRef} mode="stream" onStreamOp={(op) => {
          console.log('stream op:', op.type, op);
        }} />
      </div>
    </div>
  );
}

export function App() {
  if (window.location.pathname === '/debug/draw') {
    return <DebugDraw />;
  }
  if (window.location.pathname === '/debug/stream') {
    return <DebugStream />;
  }

  const { gameState, playerId, gameType, error, connected, connect, send, clearError, clearAddWordResult, addWordResult, onRelay } = useSocket();

  // Not connected/joined yet -> show join dialog
  if (!playerId || !gameState) {
    return (
      <div className="app">
        <img src="/drawplodocus.png" alt="Drawplodocus" className="logo" />
        <div className="card">
          <JoinDialog
            onJoin={connect}
            error={error}
            onClearError={clearError}
          />
        </div>
      </div>
    );
  }

  const disconnectBanner = !connected ? (
    <div className="disconnect-banner">Connection lost. Trying to reconnect...</div>
  ) : null;

  const title = gameType === 'pictionary' ? 'Drawplodocus' : 'Eat Poop You Cat';
  const showLogo = gameType === 'pictionary';

  const content = gameType === 'epyc'
    ? <EpycGame state={gameState as EpycClientState} playerId={playerId} send={send} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} />
    : <PictionaryGame state={gameState as PictionaryClientState} playerId={playerId} send={send} onRelay={onRelay} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} />;

  return (
    <div className="app">
      {showLogo && <img src="/drawplodocus.png" alt="Drawplodocus" className="logo" />}
      <div className="card">
        {disconnectBanner}
        {!showLogo && <h1>{title}</h1>}
        {content}
      </div>
    </div>
  );
}
