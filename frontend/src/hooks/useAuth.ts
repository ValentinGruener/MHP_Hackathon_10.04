import { useState, useCallback } from 'react';

const ADMIN_USER = 'admin';
const ADMIN_PASS = '1234';

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return sessionStorage.getItem('mhp_admin_auth') === 'true';
  });

  const login = useCallback((username: string, password: string): boolean => {
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      sessionStorage.setItem('mhp_admin_auth', 'true');
      setIsLoggedIn(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('mhp_admin_auth');
    setIsLoggedIn(false);
  }, []);

  return { isLoggedIn, login, logout };
}
