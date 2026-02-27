import { useRef, useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { JoinDialog } from './components/JoinDialog';
import { WaitingRoom } from './components/WaitingRoom';
import { GameBoard } from './components/epyc/GameBoard';
import { PostGame } from './components/epyc/PostGame';
import { PictionaryBoard } from './components/pictionary/PictionaryBoard';
import { PictionaryPostGame } from './components/pictionary/PictionaryPostGame';
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
  const [showLobby, setShowLobby] = useState(false);

  // Reset showLobby when we leave postgame
  useEffect(() => {
    if (gameState?.phase !== 'pictionary-postgame') {
      setShowLobby(false);
    }
  }, [gameState?.phase]);

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

  let content;
  switch (gameState.phase) {
    case 'epyc-waiting':
    case 'pictionary-waiting':
      content = (
        <WaitingRoom
          state={gameState}
          playerId={playerId}
          onReady={() => send({ type: 'ready' })}
          onUnready={() => send({ type: 'unready' })}
          send={send}
          addWordResult={addWordResult}
          clearAddWordResult={clearAddWordResult}
        />
      );
      break;
    case 'epyc-underway':
      content = <GameBoard state={gameState} playerId={playerId} onSend={send} />;
      break;
    case 'epyc-postgame':
      content = <PostGame state={gameState} onSend={send} />;
      break;
    case 'pictionary-active':
      content = <PictionaryBoard state={gameState} playerId={playerId} send={send} onRelay={onRelay} />;
      break;
    case 'pictionary-postgame':
      if (showLobby) {
        const waitingState: import('./types').PictionaryClientWaitingState = {
          phase: 'pictionary-waiting',
          players: gameState.players.map(p => ({
            id: p.id,
            handle: p.handle,
            ready: p.ready,
            connected: p.connected,
          })),
        };
        content = (
          <WaitingRoom
            state={waitingState}
            playerId={playerId}
            onReady={() => send({ type: 'ready' })}
            onUnready={() => send({ type: 'unready' })}
            send={send}
            addWordResult={addWordResult}
            clearAddWordResult={clearAddWordResult}
          />
        );
      } else {
        content = <PictionaryPostGame state={gameState} onNewGame={() => {
          send({ type: 'ready' });
          setShowLobby(true);
        }} />;
      }
      break;
  }

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
