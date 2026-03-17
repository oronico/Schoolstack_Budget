import { createContext, useContext, useState, ReactNode } from "react";
import { useGetMe, UserResponse } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: UserResponse | null;
  isLoading: boolean;
  login: (token: string, user: UserResponse) => void;
  logout: () => void;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
  
  const { data: user, isLoading, refetch } = useGetMe({
    query: {
      queryKey: ["/api/auth/me"],
      enabled: !!token,
      retry: false,
    }
  });

  const login = (newToken: string, _newUser: UserResponse) => {
    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
    refetch();
  };

  const logout = async () => {
    try {
      const currentToken = localStorage.getItem('auth_token');
      if (currentToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` },
        });
      }
    } catch {
      // Best-effort server invalidation; clear local state regardless
    }
    localStorage.removeItem('auth_token');
    setToken(null);
    setLocation("/login");
  };

  const refetchUser = async () => {
    await refetch();
  };

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, login, logout, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
