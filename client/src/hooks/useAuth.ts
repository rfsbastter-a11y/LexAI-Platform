import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AuthUser {
  id: number;
  tenantId: number;
  email: string;
  name: string;
  role: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lexai_token");
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser>({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Not authenticated");
      }
      return response.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logout = async () => {
    const token = localStorage.getItem("lexai_token");
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    localStorage.removeItem("lexai_token");
    queryClient.invalidateQueries({ queryKey: ["auth-user"] });
    window.location.href = "/login";
  };

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout,
  };
}
