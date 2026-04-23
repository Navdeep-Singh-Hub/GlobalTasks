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
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
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
