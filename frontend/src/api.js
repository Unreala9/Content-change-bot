import { supabase } from "./supabase";

export const getApiUrl = (path) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  let baseUrl = "";

  if (envUrl && envUrl.trim() !== "") {
    baseUrl = envUrl.trim().replace(/\/+$/, "");
  } else if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    baseUrl = "http://localhost:8000";
  } else {
    baseUrl = "https://tg.adshatke.site";
  }

  return baseUrl + (path.startsWith("/") ? path : "/" + path);
};

let refreshPromise = null;

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession().then(({ data, error }) => {
      if (error) {
        console.error("[AUTH] Session refresh failed:", error);
        return null;
      }
      return data.session?.access_token ?? null;
    }).catch(() => null).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export const authFetch = async (url, options = {}, isRetry = false) => {
  const fullUrl = getApiUrl(url);
  const reqOptions = { ...options };
  reqOptions.headers = new Headers(options.headers || {});

  let token = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token || localStorage.getItem("sb_access_token");
  } catch (e) {
    token = localStorage.getItem("sb_access_token");
  }

  if (token) {
    reqOptions.headers.set("Authorization", `Bearer ${token.trim()}`);
  }

  if (
    reqOptions.body &&
    !(reqOptions.body instanceof FormData) &&
    !reqOptions.headers.has("Content-Type") &&
    reqOptions.method &&
    reqOptions.method !== "GET"
  ) {
    reqOptions.headers.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(fullUrl, reqOptions);

    if (res.status === 401 && !isRetry) {
      console.warn(`[AUTH] 401 received for ${url}. Attempting token refresh...`);
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        localStorage.setItem("sb_access_token", refreshedToken);
        return authFetch(url, options, true);
      } else {
        console.warn(`[AUTH] Session invalid. Clearing local auth state.`);
        localStorage.removeItem("sb_access_token");
        await supabase.auth.signOut().catch(() => { });
      }
    }

    return res;
  } catch (err) {
    if (!isRetry && (err.name === "TypeError" || err.message?.includes("Failed to fetch"))) {
      console.warn(`[API] Network error fetching ${fullUrl}. Retrying in 1s...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return authFetch(url, options, true);
    }
    console.error(`Fetch error for ${fullUrl}:`, err);
    throw err;
  }
};
