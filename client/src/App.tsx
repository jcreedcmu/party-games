import { useSocket } from './hooks/useSocket';
import { JoinDialog } from './components/JoinDialog';
import { WaitingRoom } from './components/WaitingRoom';

export function App() {
  const { gameState, playerId, error, connect, send, clearError } = useSocket();

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

  // Route by game phase
  switch (gameState.phase) {
    case 'waiting':
      return (
        <div className="app">
          <h1>Eat Poop You Cat</h1>
          <WaitingRoom
            state={gameState}
            playerId={playerId}
            onReady={() => send({ type: 'ready' })}
            onUnready={() => send({ type: 'unready' })}
          />
        </div>
      );
    case 'underway':
      return (
        <div className="app">
          <h1>Eat Poop You Cat</h1>
          <p>Game in progress...</p>
        </div>
      );
    case 'postgame':
      return (
        <div className="app">
          <h1>Eat Poop You Cat</h1>
          <p>Game over!</p>
        </div>
      );
  }
}
