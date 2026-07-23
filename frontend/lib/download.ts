import api from "./api";

/**
 * Authenticated file download — uses the axios instance (with Bearer token) so protected API
 * routes receive the auth header.
 *
 * Exports of large rounds take well over the default 35s client timeout, and if the server
 * returns an error the response body is an error JSON, not a file. Both used to fail silently —
 * the button just "did nothing". So: a generous timeout, and if the download fails (or the body
 * is an error rather than a file) we throw a readable Error the caller can show.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  let resp;
  try {
    resp = await api.get(path, { responseType: "blob", timeout: 180000 });
  } catch (err: unknown) {
    const anyErr = err as { response?: { data?: unknown; status?: number }; code?: string };
    let detail = "";
    const data = anyErr.response?.data;
    if (data instanceof Blob) {
      try { detail = JSON.parse(await data.text())?.detail || ""; } catch { /* not JSON */ }
    }
    if (anyErr.code === "ECONNABORTED") throw new Error("The export took too long and timed out. Please try again.");
    throw new Error(detail || `Download failed${anyErr.response?.status ? ` (error ${anyErr.response.status})` : ""}.`);
  }

  const contentType = (resp.headers["content-type"] as string) || "application/octet-stream";
  // A JSON body here means the server returned an error with a 2xx-looking response — surface it.
  if (contentType.includes("application/json")) {
    try {
      const msg = JSON.parse(await (resp.data as Blob).text())?.detail;
      if (msg) throw new Error(msg);
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
    }
  }

  const blob = new Blob([resp.data], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
