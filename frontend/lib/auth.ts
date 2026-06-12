export interface AuthUser {
  access_token: string;
  role: string;
  user_id: number;
  full_name: string;
}

const isBrowser = typeof window !== "undefined";

export function saveAuth(data: AuthUser) {
  if (!isBrowser) return;
  // Do NOT store the JWT in localStorage — it lives in an httpOnly cookie set by the server.
  // We only keep non-sensitive UI hints here.
  localStorage.setItem("role", data.role);
  localStorage.setItem("user_id", String(data.user_id));
  localStorage.setItem("full_name", data.full_name);
}

export function getRole(): string {
  if (!isBrowser) return "";
  return localStorage.getItem("role") || "";
}

export function getFullName(): string {
  if (!isBrowser) return "";
  return localStorage.getItem("full_name") || "";
}

export function isAdmin(): boolean {
  return getRole() === "admin";
}

export async function logout() {
  if (!isBrowser) return;
  try {
    // Tell the server to clear the httpOnly cookie
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "https://thinktls-api.onrender.com/api"}/auth/logout`,
      { method: "POST", credentials: "include" }
    );
  } catch {
    // ignore network errors — clear local state regardless
  }
  localStorage.clear();
  window.location.href = "/login";
}
