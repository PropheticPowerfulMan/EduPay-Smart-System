const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const TOKEN_STORAGE_KEY = "edupay_token";
const ROLE_STORAGE_KEY = "edupay_role";
const NAME_STORAGE_KEY = "edupay_name";
const SESSION_ACTIVE_KEY = "edupay_session_active";

function clearLocalSession() {
  sessionStorage.removeItem(SESSION_ACTIVE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(NAME_STORAGE_KEY);
  localStorage.removeItem("edupay_fullName");
}

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const url = resolveApiUrl(path);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {})
      }
    });
  } catch {
    throw new Error("Impossible de joindre l'API. Verifiez que le backend est demarre.");
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearLocalSession();
      window.location.replace("/login");
      throw new Error("Session expiree. Veuillez vous reconnecter.");
    }

    const errorFromJson = await response.json().catch(() => null) as { message?: string } | null;
    if (errorFromJson?.message) {
      throw new Error(errorFromJson.message);
    }

    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Erreur API (${response.status})`);
  }

  // Handle endpoints that return 204 No Content (e.g. DELETE)
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}
