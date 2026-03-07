import { useRef, useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useP2P } from './hooks/useP2P';
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
  send: (msg: ClientMessage) => void;
  onRelay: (listener: (payload: RelayPayload) => void) => () => void;
  addWordResult: { success: boolean; message: string } | null;
  clearAddWordResult: () => void;
  topBanner?: React.ReactNode;
};

function GameShell({ gameState, playerId, gameType, connected, send, onRelay, addWordResult, clearAddWordResult, topBanner }: GameShellProps) {
  const disconnectBanner = !connected ? (
    <div className="disconnect-banner">Connection lost. Trying to reconnect...</div>
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

function P2PApp({ gameType, initialRoomName }: { gameType: GameType; initialRoomName?: string }) {
  const { gameState, playerId, error, connected, connect, send, clearError, clearAddWordResult, addWordResult, onRelay, roomName } = useP2P(gameType, initialRoomName);
  const [copied, setCopied] = useState(false);

  if (playerId && gameState) {
    const joinLink = `${window.location.origin}${base}#p2p/${gameType}/${roomName}`;
    const roomBanner = (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.85em', opacity: 0.8 }}>
        <span>Room: <strong>{roomName}</strong></span>
        <button style={{ fontSize: '0.85em', padding: '2px 8px' }} onClick={() => {
          navigator.clipboard.writeText(joinLink);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}>{copied ? 'Copied!' : 'Copy Link'}</button>
      </div>
    );
    return <GameShell gameState={gameState} playerId={playerId} gameType={gameType} connected={connected} send={send} onRelay={onRelay} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} topBanner={roomBanner} />;
  }

  return (
    <div className="app">
      <img src={getLogo(gameType)} alt={getLogoAlt(gameType)} className="logo" />
      <div className="card">
        <JoinDialog
          onJoin={connect}
          error={error}
          onClearError={clearError}
          passwordLabel="Room Name"
          passwordPlaceholder="Choose a room name"
          defaultPassword={initialRoomName}
        />
      </div>
    </div>
  );
}

function ServerApp() {
  const { gameState, playerId, gameType, error, connected, connect, send, clearError, clearAddWordResult, addWordResult, onRelay } = useSocket();

  if (playerId && gameState) {
    return <GameShell gameState={gameState} playerId={playerId} gameType={gameType} connected={connected} send={send} onRelay={onRelay} addWordResult={addWordResult} clearAddWordResult={clearAddWordResult} />;
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

function parseHash(): { mode: 'server' } | { mode: 'p2p'; gameType: GameType; roomName?: string } {
  const hash = window.location.hash;

  if (hash.startsWith('#p2p/')) {
    const rest = hash.slice(5);
    const slashIdx = rest.indexOf('/');
    if (slashIdx >= 0) {
      const gameType = rest.slice(0, slashIdx) as GameType;
      const roomName = decodeURIComponent(rest.slice(slashIdx + 1));
      if ((gameType === 'epyc' || gameType === 'pictionary') && roomName) {
        return { mode: 'p2p', gameType, roomName };
      }
    }
    const gameType = rest as GameType;
    if (gameType === 'epyc' || gameType === 'pictionary') {
      return { mode: 'p2p', gameType };
    }
  }

  return { mode: 'server' };
}

export function App() {
  if (window.location.pathname === '/debug/draw') {
    return <DebugDraw />;
  }
  if (window.location.pathname === '/debug/stream') {
    return <DebugStream />;
  }

  const route = parseHash();

  switch (route.mode) {
    case 'p2p':
      return <P2PApp gameType={route.gameType} initialRoomName={route.roomName} />;
    case 'server':
      return <ServerApp />;
  }
}
