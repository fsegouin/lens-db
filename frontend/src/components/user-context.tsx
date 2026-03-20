"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type User = {
  id: number;
  displayName: string;
  role: string;
  editCount: number;
  emailVerifiedAt: string | null;
};

type UserContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UserContext.Provider value={{ user, loading, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
