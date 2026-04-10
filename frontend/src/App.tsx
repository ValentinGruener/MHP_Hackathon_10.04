import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { LoginModal } from './components/LoginModal';
import { CheckerPage } from './pages/CheckerPage';
import { AdminPage } from './pages/AdminPage';
import { useAuth } from './hooks/useAuth';

type Theme = 'light' | 'dark';

export function App() {
  const { isLoggedIn, login, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('mhp_theme') as Theme) || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mhp_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleLogin = (username: string, password: string): boolean => {
    const ok = login(username, password);
    if (ok) setShowLogin(false);
    return ok;
  };

  return (
    <BrowserRouter>
      <div className="app">
        <Header
          isLoggedIn={isLoggedIn}
          onLoginClick={() => setShowLogin(true)}
          onLogout={logout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <main className="main">
          <Routes>
            <Route path="/" element={<CheckerPage />} />
            <Route
              path="/admin"
              element={isLoggedIn ? <AdminPage /> : <Navigate to="/" replace />}
            />
          </Routes>
        </main>

        {showLogin && (
          <LoginModal onLogin={handleLogin} onClose={() => setShowLogin(false)} />
        )}
      </div>
    </BrowserRouter>
  );
}
