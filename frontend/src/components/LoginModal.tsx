import { useState } from 'react';

interface Props {
  onLogin: (username: string, password: string) => boolean;
  onClose: () => void;
}

export function LoginModal({ onLogin, onClose }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onLogin(username, password);
    if (!ok) setError(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Admin Login</h2>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
              Falscher Benutzername oder Passwort
            </div>
          )}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label>Benutzername</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(false); }}
              placeholder="Benutzername"
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              placeholder="Passwort"
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="submit" className="btn btn-primary">Anmelden</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          </div>
        </form>
      </div>
    </div>
  );
}
