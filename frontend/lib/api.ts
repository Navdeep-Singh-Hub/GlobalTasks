function normalizeNextPublicApiUrl(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "http://localhost:5000/api";
  // Remove trailing slashes
  let s = raw.replace(/\/+$/g, "");
  // If user points to bare host (Render), append /api
  if (!/\/api$/i.test(s)) s = `${s}/api`;
  return s;
}

const API_BASE = normalizeNextPublicApiUrl(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api");
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/i, "");

/** In-flight GET dedupe so shell + page don't hit same endpoint twice at once. */
const inflightGets = new Map<string, Promise<unknown>>();
/** Short TTL cache for high-frequency shell GETs (ms). */
const getCache = new Map<string, { at: number; data: unknown }>();
const SHELL_CACHE_TTL_MS = 8_000;

function isShellCachedPath(path: string): boolean {
  return (
    path.startsWith("/notifications") ||
    path.startsWith("/auth/me") ||
    (path.startsWith("/tasks?") && path.includes("limit=1"))
  );
}

export function assetUrl(relOrAbs: string): string {
  if (!relOrAbs) return "";
  if (/^https?:\/\//i.test(relOrAbs)) return relOrAbs;
  return `${API_ORIGIN}${relOrAbs.startsWith("/") ? "" : "/"}${relOrAbs}`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tms_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("tms_token", token);
  else localStorage.removeItem("tms_token");
  // New session — drop cached GETs
  inflightGets.clear();
  getCache.clear();
}

/** Drop client GET caches after mutations so lists refresh immediately. */
export function invalidateApiCache(pathPrefix?: string) {
  if (!pathPrefix) {
    inflightGets.clear();
    getCache.clear();
    return;
  }
  Array.from(inflightGets.keys()).forEach((key) => {
    if (key.startsWith(pathPrefix)) inflightGets.delete(key);
  });
  Array.from(getCache.keys()).forEach((key) => {
    if (key.startsWith(pathPrefix)) getCache.delete(key);
  });
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function rawFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = (errBody as { message?: string }).message || res.statusText;
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type");
  if (ct?.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as Promise<T>;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = String(options.method || "GET").toUpperCase();
  const noStore = options.cache === "no-store";
  const useGetOptimizations = method === "GET" && !noStore;

  if (useGetOptimizations) {
    if (isShellCachedPath(path)) {
      const hit = getCache.get(path);
      if (hit && Date.now() - hit.at < SHELL_CACHE_TTL_MS) {
        return hit.data as T;
      }
    }

    const existing = inflightGets.get(path);
    if (existing) return existing as Promise<T>;

    const p = rawFetch<T>(path, options)
      .then((data) => {
        if (isShellCachedPath(path)) {
          getCache.set(path, { at: Date.now(), data });
        }
        inflightGets.delete(path);
        return data;
      })
      .catch((err) => {
        inflightGets.delete(path);
        throw err;
      });
    inflightGets.set(path, p);
    return p;
  }

  // Mutations: clear related GET caches so next list loads fresh data
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    invalidateApiCache("/tasks");
    invalidateApiCache("/dashboard");
    invalidateApiCache("/notifications");
    invalidateApiCache("/reports");
  }

  return rawFetch<T>(path, options);
}

export async function downloadExport(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
