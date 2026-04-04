import { useRef } from 'react';
import { useSocket } from './hooks/useSocket';
import { JoinDialog } from './components/JoinDialog';
import { EpycGame } from './components/epyc/EpycGame';
import { PictionaryGame } from './components/pictionary/PictionaryGame';
import { DrawingCanvas } from './components/DrawingCanvas';
import type { EpycClientState, PictionaryClientState, GameType, ClientGameState, ClientMessage, RelayPayload } from './types';

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

const base = import.meta.env.BASE_URL;

function getLogo(gameType: GameType | null) {
  return gameType === 'epyc' ? `${base}epyc.png` : `${base}drawplodocus.png`;
}

function getLogoAlt(gameType: GameType | null) {
  return gameType === 'epyc' ? 'Eat Poop You Cat' : 'Drawplodocus';
}

type GameShellProps = {
  gameState: ClientGameState;
  playerId: string;
  gameType: GameType | null;
  connected: boolean;
  reconnect: () => void;
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
  addWordResult: { success: boolean; message: string } | null;
  clearAddWordResult: () => void;
  topBanner?: React.ReactNode;
};

function GameShell({ gameState, playerId, gameType, connected, reconnect, send, onRelay, addWordResult, clearAddWordResult, topBanner }: GameShellProps) {
  const disconnectBanner = !connected ? (
    <div className="disconnect-banner">
      Connection lost. <button className="reconnect-btn" onClick={reconnect}>Reconnect</button>
    </div>
  ) : null;

  const content = gameType === 'epyc'
    ? <EpycGame state={gameState as EpycClientState} playerId={playerId} send={send} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} />
    : <PictionaryGame state={gameState as PictionaryClientState} playerId={playerId} send={send} onRelay={onRelay} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} />;

  return (
    <div className="app">
      <img src={getLogo(gameType)} alt={getLogoAlt(gameType)} className="logo" />
      <div className="card">
        {topBanner}
        {disconnectBanner}
        {content}
      </div>
    </div>
  );
}

function ServerApp() {
  const { gameState, playerId, gameType, error, connected, connect, reconnect, send, clearError, clearAddWordResult, addWordResult, onRelay } = useSocket();

  if (playerId && gameState) {
    return <GameShell gameState={gameState} playerId={playerId} gameType={gameType} connected={connected} reconnect={reconnect} send={send} onRelay={onRelay} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} />;
  }

  return (
    <div className="app">
      <img src={getLogo(gameType)} alt={getLogoAlt(gameType)} className="logo" />
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

export function App() {
  if (window.location.pathname === '/debug/draw') {
    return <DebugDraw />;
  }
  if (window.location.pathname === '/debug/stream') {
    return <DebugStream />;
  }

  return <ServerApp />;
}
