/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api, getErrorMessage, setAuthHeader, TOKEN_STORAGE_KEY } from "../api/client";
import type { AdminUser } from "../api/types";

interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

interface AuthContextValue {
  user: AdminUser | null;
  token: string | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialToken =
  typeof window !== "undefined" ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(initialToken));

  const handleLogout = useCallback(() => {
    setAuthHeader(null);
    setUser(null);
    setToken(null);
    setLoading(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          handleLogout();
        }
        return Promise.reject(error);
      },
    );
    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, [handleLogout]);

  useEffect(() => {
    if (!token) {
      setAuthHeader(null);
      return;
    }

    let cancelled = false;
    setAuthHeader(token);
    api
      .get("/auth/me")
      .then((res) => {
        if (!cancelled) {
          setUser(res.data.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          handleLogout();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, handleLogout]);

  const login = useCallback(async ({ email, password, remember }: LoginInput) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setToken(data.token);
      setUser(data.user);
      setAuthHeader(data.token);
      if (remember) {
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      toast.success("Welcome back!");
    } catch (error) {
      setLoading(false);
      toast.error(getErrorMessage(error));
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    handleLogout();
    toast.success("Signed out");
  }, [handleLogout]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
    }),
    [user, token, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
