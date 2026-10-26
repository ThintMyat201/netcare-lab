import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, errorStatus } from './lib/api';
import { User } from './lib/types';

export type LoginBody = { email: string; password: string } | { role: string };

export interface AuthContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  updateUser: (updated: Partial<User>) => void;
  ready: boolean;
  login: (body: LoginBody, demo?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const Context = createContext<AuthContextValue>(null);
export const useAuth = () => useContext(Context);
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await api.get<User>('/auth/me');
        if (live) setUser(r.data);
      } catch (e) {
        if (
          errorStatus(e) === 401 &&
          !sessionStorage.getItem('atlas-logged-out') &&
          window.location.pathname !== '/login'
        ) {
          try {
            const r = await api.post<User>('/auth/demo', { role: 'admin' });
            if (live) setUser(r.data);
          } catch {}
        }
      } finally {
        if (live) setReady(true);
      }
    })();
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);
    return () => {
      live = false;
      window.removeEventListener('session-expired', expired);
    };
  }, []);
  const login = async (body: LoginBody, demo = false) => {
    const r = await api.post<User>(demo ? '/auth/demo' : '/auth/login', body);
    sessionStorage.removeItem('atlas-logged-out');
    setUser(r.data);
  };
  const logout = async () => {
    await api.post('/auth/logout');
    sessionStorage.setItem('atlas-logged-out', 'true');
    setUser(null);
  };
  const updateUser = (updated: Partial<User>) => {
    setUser(prev => (prev ? { ...prev, ...updated } : null));
  };
  return <Context.Provider value={{ user, setUser, updateUser, ready, login, logout }}>{children}</Context.Provider>;
};
