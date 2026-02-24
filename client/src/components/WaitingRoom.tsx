import type { ClientWaitingState } from '../types';

type WaitingRoomProps = {
  state: ClientWaitingState;
  playerId: string;
  onReady: () => void;
  onUnready: () => void;
};

export function WaitingRoom({ state, playerId, onReady, onUnready }: WaitingRoomProps) {
  const me = state.players.find(p => p.id === playerId);
  const isReady = me?.ready ?? false;

  return (
    <div className="waiting-room">
      <h2>Waiting Room</h2>
      <ul className="player-list">
        {state.players.map(p => (
          <li key={p.id} className={p.id === playerId ? 'me' : ''}>
            <span className="player-name">{p.handle}</span>
            {p.ready && <span className="ready-indicator"> ✓</span>}
          </li>
        ))}
      </ul>
      <button onClick={isReady ? onUnready : onReady}>
        {isReady ? 'Not Ready' : 'Ready'}
      </button>
    </div>
  );
}
