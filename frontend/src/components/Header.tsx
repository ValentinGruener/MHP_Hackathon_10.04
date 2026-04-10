import { Link, useLocation } from 'react-router-dom';

interface Props {
  isLoggedIn: boolean;
  onLoginClick: () => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function Header({ isLoggedIn, onLoginClick, onLogout, theme, onToggleTheme }: Props) {
  const location = useLocation();

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-mark">
          <span className="logo-bar" />
          <span className="logo-bar" />
        </div>
        <div>
          <h1>MHP CD-Checker</h1>
          <div className="logo-sub">Corporate Design Compliance</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <nav className="header-nav">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            Pruefen
          </Link>
          {isLoggedIn && (
            <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>
              Templates
            </Link>
          )}
        </nav>
        <button className="theme-toggle" onClick={onToggleTheme} title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
          {theme === 'light' ? '\u263E' : '\u2600'}
        </button>
        {isLoggedIn ? (
          <button className="btn btn-secondary" onClick={onLogout} style={{ fontSize: '0.85rem' }}>
            Abmelden
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={onLoginClick} style={{ fontSize: '0.85rem' }}>
            Admin Login
          </button>
        )}
      </div>
    </header>
  );
}
