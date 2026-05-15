import api from "./api";

/**
 * Authenticated file download — uses the axios instance (with Bearer token)
 * so protected API routes receive the auth header.
 * Falls back to a direct <a> if no token is present.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const resp = await api.get(path, { responseType: "blob" });
  const blob = new Blob([resp.data], { type: (resp.headers["content-type"] as string) || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
