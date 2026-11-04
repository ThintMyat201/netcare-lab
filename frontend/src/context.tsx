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

const STORAGE_KEYS = {
  USER: 'atlas_user',
  TOKEN: 'atlas_token',
  REFRESH: 'atlas_refresh_token',
  LOGGED_OUT: 'atlas-logged-out',
  LEGACY_USER: 'atlas_current_user',
};

export const getStoredUser = (): User | null => {
  try {
    const raw =
      sessionStorage.getItem(STORAGE_KEYS.USER) ||
      localStorage.getItem(STORAGE_KEYS.USER) ||
      localStorage.getItem(STORAGE_KEYS.LEGACY_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.role) {
      return parsed;
    }
  } catch (err) {
    console.warn('[Auth] Failed to parse stored user profile:', err);
  }
  return null;
};

export const saveUserSession = (userData: User & { token?: string; access_token?: string; refresh_token?: string }) => {
  try {
    const token = userData.token || userData.access_token;
    if (token) {
      sessionStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    }
    if (userData.refresh_token) {
      sessionStorage.setItem(STORAGE_KEYS.REFRESH, userData.refresh_token);
      localStorage.setItem(STORAGE_KEYS.REFRESH, userData.refresh_token);
    }

    const cleanUser: User = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      active: userData.active,
      scope: userData.scope,
      created_at: userData.created_at,
    };
    const userStr = JSON.stringify(cleanUser);
    sessionStorage.setItem(STORAGE_KEYS.USER, userStr);
    localStorage.setItem(STORAGE_KEYS.USER, userStr);
    localStorage.setItem(STORAGE_KEYS.LEGACY_USER, userStr);
    sessionStorage.removeItem(STORAGE_KEYS.LOGGED_OUT);
  } catch (err) {
    console.warn('[Auth] Failed to persist session to storage:', err);
  }
};

export const clearUserSession = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.USER);
    sessionStorage.removeItem(STORAGE_KEYS.TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.REFRESH);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_USER);
  } catch (err) {
    console.warn('[Auth] Failed to clear storage:', err);
  }
};

const Context = createContext<AuthContextValue>(null);
export const useAuth = () => useContext(Context);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    // If explicitly marked as logged out, do not auto-restore
    if (sessionStorage.getItem(STORAGE_KEYS.LOGGED_OUT) === 'true') {
      return null;
    }
    const initial = getStoredUser();
    if (initial) {
      console.log('[AuthContext] Restored active session from storage:', initial.email, 'Role:', initial.role);
    }
    return initial;
  });

  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;

    (async () => {
      const isLoggedOut = sessionStorage.getItem(STORAGE_KEYS.LOGGED_OUT) === 'true';
      if (isLoggedOut) {
        console.log('[AuthContext] Explicit logout marker found; bypassing session re-verification.');
        if (live) {
          setUser(null);
          setReady(true);
        }
        return;
      }

      const stored = getStoredUser();
      console.log('[AuthContext] Verifying current session with server. Local user:', stored?.email || 'none');

      try {
        const r = await api.get<User>('/auth/me');
        console.log('[AuthContext] /auth/me verification succeeded:', r.data.email, 'Role:', r.data.role);
        if (live) {
          saveUserSession(r.data);
          setUser(r.data);
        }
      } catch (e) {
        const status = errorStatus(e);
        console.warn('[AuthContext] /auth/me check failed with status:', status, e);

        if (status === 401) {
          // Attempt token refresh recovery
          try {
            console.log('[AuthContext] Attempting refresh token recovery...');
            const refreshToken =
              sessionStorage.getItem(STORAGE_KEYS.REFRESH) || localStorage.getItem(STORAGE_KEYS.REFRESH);
            const headers: Record<string, string> = {};
            if (refreshToken) {
              headers['X-Refresh-Token'] = refreshToken;
              headers['Authorization'] = `Bearer ${refreshToken}`;
            }
            const refreshed = await api.post<User>('/auth/refresh', {}, { headers });
            console.log('[AuthContext] Refresh recovery succeeded:', refreshed.data.email);
            if (live) {
              saveUserSession(refreshed.data);
              setUser(refreshed.data);
            }
          } catch (refreshErr) {
            console.warn('[AuthContext] Refresh recovery failed:', refreshErr);
            if (live) {
              clearUserSession();
              setUser(null);
            }
          }
        } else if (stored && (status === undefined || status >= 500)) {
          // Server might be sleeping (Render free tier) or temporary network hiccup: preserve stored session
          console.log('[AuthContext] Server sleeping or network hiccup; retaining local session for:', stored.email);
          if (live) setUser(stored);
        }
      } finally {
        if (live) setReady(true);
      }
    })();

    const handleSessionExpired = () => {
      console.warn('[AuthContext] session-expired event received; clearing auth state.');
      clearUserSession();
      setUser(null);
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => {
      live = false;
      window.removeEventListener('session-expired', handleSessionExpired);
    };
  }, []);

  const login = async (body: LoginBody, demo = false) => {
    console.log('[AuthContext] Initiating sign-in:', demo ? 'demo' : 'credentials', body);
    try {
      const endpoint = demo ? '/auth/demo' : '/auth/login';
      const r = await api.post<User & { token?: string; access_token?: string; refresh_token?: string }>(
        endpoint,
        body,
      );

      console.log('[AuthContext] Server answered sign-in with 200 OK:', r.data);
      const userData = r.data;

      if (!userData || !userData.id || !userData.role) {
        console.error('[AuthContext] Malformed user object in response:', userData);
        throw new Error('Received invalid user credentials structure from server.');
      }

      saveUserSession(userData);
      sessionStorage.removeItem(STORAGE_KEYS.LOGGED_OUT);
      setUser(userData);
      console.log('[AuthContext] User state committed for:', userData.email, 'Role:', userData.role);
    } catch (err) {
      console.error('[AuthContext] Sign-in failed:', err);
      throw err;
    }
  };

  const logout = async () => {
    console.log('[AuthContext] Performing user logout...');
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.warn('[AuthContext] Backend logout request error (proceeding with local cleanup):', e);
    } finally {
      sessionStorage.setItem(STORAGE_KEYS.LOGGED_OUT, 'true');
      clearUserSession();
      setUser(null);
      console.log('[AuthContext] Local session cleared.');
    }
  };

  const updateUser = (updated: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const merged = { ...prev, ...updated };
      saveUserSession(merged);
      return merged;
    });
  };

  return <Context.Provider value={{ user, setUser, updateUser, ready, login, logout }}>{children}</Context.Provider>;
};
