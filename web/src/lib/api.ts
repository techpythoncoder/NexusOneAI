import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/store/auth-store";

const api = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined" && !config.headers.Authorization) {
    const token = localStorage.getItem("nexus_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Track whether a refresh is already in flight to avoid multiple parallel refreshes
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem("nexus_refresh_token");
  if (!refreshToken) throw new Error("No refresh token");

  const res = await axios.post("/api/v1/auth/refresh", { refresh_token: refreshToken });
  const { access_token, refresh_token: newRefreshToken } = res.data;

  localStorage.setItem("nexus_token", access_token);
  if (newRefreshToken) localStorage.setItem("nexus_refresh_token", newRefreshToken);

  // Sync token to Zustand auth store so React components get the fresh token
  useAuthStore.getState().setToken(access_token);

  return access_token;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (err.response?.status === 401 && !original._retry && typeof window !== "undefined") {
      // Don't retry refresh/login calls — they're expected to 401 on bad credentials
      const isAuthEndpoint = original.url?.includes("/auth/login") ||
        original.url?.includes("/auth/refresh");

      if (!isAuthEndpoint) {
        original._retry = true;
        try {
          // Deduplicate concurrent 401s — only one refresh call in flight at a time
          if (!refreshPromise) {
            refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
          }
          const newToken = await refreshPromise;
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch {
          // Refresh failed — clear session and send to login
          localStorage.removeItem("nexus_token");
          localStorage.removeItem("nexus_refresh_token");
          useAuthStore.getState().logout();
          window.location.href = "/login";
        }
      } else {
        localStorage.removeItem("nexus_token");
        localStorage.removeItem("nexus_refresh_token");
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }

    return Promise.reject(err);
  }
);

export default api;
