export interface AuthUser {
  access_token: string;
  role: string;
  user_id: number;
  full_name: string;
}

const isBrowser = typeof window !== "undefined";

export function saveAuth(data: AuthUser) {
  if (!isBrowser) return;
  localStorage.setItem("token", data.access_token);
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

export function logout() {
  if (!isBrowser) return;
  localStorage.clear();
  window.location.href = "/login";
}
