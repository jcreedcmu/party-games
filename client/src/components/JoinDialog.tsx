import { useState, type FormEvent } from 'react';

type JoinDialogProps = {
  onJoin: (password: string, handle: string) => void;
  error: string | null;
  onClearError: () => void;
};

export function JoinDialog({ onJoin, error, onClearError }: JoinDialogProps) {
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (handle.trim() && password.trim()) {
      onJoin(password.trim(), handle.trim());
    }
  }

  return (
    <div className="join-dialog">
      <h2>Join Game</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Handle
          <input
            type="text"
            value={handle}
            onChange={e => { setHandle(e.target.value); onClearError(); }}
            placeholder="Your name"
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); onClearError(); }}
            placeholder="Game password"
          />
        </label>
        {error && <div className="error-message">{error}</div>}
        <button type="submit" disabled={!handle.trim() || !password.trim()}>
          Join
        </button>
      </form>
    </div>
  );
}
