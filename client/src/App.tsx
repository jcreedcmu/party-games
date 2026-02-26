import { useRef } from 'react';
import { useSocket } from './hooks/useSocket';
import { JoinDialog } from './components/JoinDialog';
import { WaitingRoom } from './components/WaitingRoom';
import { GameBoard } from './components/epyc/GameBoard';
import { PostGame } from './components/epyc/PostGame';
import { DrawingCanvas } from './components/DrawingCanvas';

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

export function App() {
  if (window.location.pathname === '/debug/draw') {
    return <DebugDraw />;
  }

  const { gameState, playerId, error, connected, connect, send, clearError } = useSocket();

  // Not connected/joined yet → show join dialog
  if (!playerId || !gameState) {
    return (
      <div className="app">
        <h1>Eat Poop You Cat</h1>
        <JoinDialog
          onJoin={connect}
          error={error}
          onClearError={clearError}
        />
      </div>
    );
  }

  const disconnectBanner = !connected ? (
    <div className="disconnect-banner">Connection lost. Trying to reconnect...</div>
  ) : null;

  let content;
  switch (gameState.phase) {
    case 'epyc-waiting':
      content = (
        <WaitingRoom
          state={gameState}
          playerId={playerId}
          onReady={() => send({ type: 'ready' })}
          onUnready={() => send({ type: 'unready' })}
        />
      );
      break;
    case 'epyc-underway':
      content = <GameBoard state={gameState} playerId={playerId} onSend={send} />;
      break;
    case 'epyc-postgame':
      content = <PostGame state={gameState} onSend={send} />;
      break;
  }

  return (
    <div className="app">
      {disconnectBanner}
      <h1>Eat Poop You Cat</h1>
      {content}
    </div>
  );
}
