"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) setError("Missing or invalid reset token.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px", height: "36px", background: "var(--brand)",
              borderRadius: "10px", display: "flex", alignItems: "center",
              justifyContent: "center", fontWeight: 800, color: "#ffffff",
            }}>T</div>
            <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "#ffffff" }}>ThinkTLS Bid Desk</span>
          </div>
        </div>

        <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: "40px", border: "1px solid var(--glass-border)" }}>
          {done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>✅</div>
              <h2 style={{ color: "#ffffff", fontWeight: 700, marginBottom: "8px", fontSize: "1.15rem" }}>
                Password updated!
              </h2>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", marginBottom: "20px" }}>
                Redirecting you to login…
              </p>
              <Link href="/login" style={{ color: "var(--brand)", fontSize: "0.875rem", textDecoration: "none" }}>
                Go to Login →
              </Link>
            </div>
          ) : (
            <>
              <h1 style={{ color: "#ffffff", fontSize: "1.15rem", fontWeight: 650, letterSpacing: "-0.02em", marginBottom: "6px" }}>
                Set new password
              </h1>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", marginBottom: "28px" }}>
                Choose a strong password (min. 8 characters).
              </p>

              {error && (
                <div style={{
                  background: "var(--danger-dim)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "var(--danger)",
                  fontSize: "0.85rem",
                  marginBottom: "18px",
                }}>{error}</div>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.8rem", fontWeight: 500, display: "block", marginBottom: "6px" }}>
                    New password
                  </label>
                  <input
                    type="password"
                    className="glass-input"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.8rem", fontWeight: 500, display: "block", marginBottom: "6px" }}>
                    Confirm password
                  </label>
                  <input
                    type="password"
                    className="glass-input"
                    placeholder="Re-enter password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-brand"
                  disabled={loading || !token}
                  style={{ width: "100%", marginTop: "4px" }}
                >
                  {loading ? "Updating…" : "Reset Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
