export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("edupay_token");
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Erreur API" }));
    throw new Error(error.message || "Erreur API");
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
