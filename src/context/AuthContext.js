import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { AUTH_BACKEND, authService } from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = authService.subscribe((u) => {
      setUser(u);
      setInitializing(false);
    });
    return unsub;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      backend: AUTH_BACKEND,
      signIn: async (email, password) => {
        const u = await authService.signIn(email, password);
        setUser(u);
        return u;
      },
      signUp: async (email, password, displayName) => {
        const u = await authService.signUp(email, password, displayName);
        setUser(u);
        return u;
      },
      signOut: () => authService.signOut(),
      resetPassword: (email) => authService.resetPassword(email),
    }),
    [user, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
