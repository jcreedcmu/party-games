import { useState, type FormEvent } from 'react';

type JoinDialogProps = {
  onJoin: (password: string, handle: string) => void;
  error: string | null;
  onClearError: () => void;
  showPassword?: boolean;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  defaultPassword?: string;
};

export function JoinDialog({ onJoin, error, onClearError, showPassword = true, passwordLabel = 'Password', passwordPlaceholder = 'Game password', defaultPassword = '' }: JoinDialogProps) {
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState(defaultPassword);

  const canSubmit = handle.trim() && (showPassword ? password.trim() : true);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) {
      onJoin(showPassword ? password.trim() : '', handle.trim());
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
        {showPassword && (
          <label>
            {passwordLabel}
            <input
              type={passwordLabel === 'Password' ? 'password' : 'text'}
              value={password}
              onChange={e => { setPassword(e.target.value); onClearError(); }}
              placeholder={passwordPlaceholder}
            />
          </label>
        )}
        {error && <div className="error-message">{error}</div>}
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          Join
        </button>
      </form>
    </div>
  );
}
