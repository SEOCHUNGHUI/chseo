const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    if (getToken()) {
      setToken(null);
      window.location.href = "/login";
    }
    const err = await res.json().catch(() => ({ detail: "Unauthorized" }));
    throw new Error(err.detail ?? "Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function wsUrl(path: string): string {
  const token = getToken();
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const base = import.meta.env.VITE_API_BASE;
  if (base) {
    const url = new URL(base, window.location.origin);
    return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}${path}?token=${token}`;
  }
  return `${proto}//${host}${path}?token=${encodeURIComponent(token ?? "")}`;
}
