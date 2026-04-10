import { Link, useLocation } from 'react-router-dom';

export function Header() {
  const location = useLocation();

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-mark">CI</div>
        <div>
          <h1>CI Checker</h1>
          <div className="logo-sub">Corporate Design Compliance</div>
        </div>
      </div>
      <nav className="header-nav">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          Prüfen
        </Link>
        <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>
          Templates
        </Link>
      </nav>
    </header>
  );
}
