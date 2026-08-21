"use client";
import { useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0c0c0c",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
      }}>
        {/* Logo area */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "8px",
          }}>
            <div style={{
              width: "36px",
              height: "36px",
              background: "#3D81E3",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1rem",
              color: "#ffffff",
            }}>T</div>
            <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "#ffffff" }}>ThinkTLS Bid Desk</span>
          </div>
        </div>

        <div className="glass" style={{ borderRadius: "16px", padding: "40px 36px" }}>
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>📧</div>
              <h2 style={{ color: "#ffffff", fontWeight: 700, marginBottom: "8px", fontSize: "1.15rem" }}>
                Check your email
              </h2>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "24px" }}>
                If <strong style={{ color: "#ffffff" }}>{email}</strong> is registered, you'll receive a reset link within a few minutes.
              </p>
              <Link href="/login" style={{
                color: "#3D81E3",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}>← Back to Login</Link>
            </div>
          ) : (
            <>
              <h1 style={{
                color: "#ffffff",
                fontSize: "1.25rem",
                fontWeight: 700,
                marginBottom: "6px",
              }}>Reset your password</h1>
              <p style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.875rem",
                marginBottom: "28px",
                lineHeight: 1.5,
              }}>
                Enter your email and we'll send a reset link if the account exists.
              </p>

              {error && (
                <div style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "#f87171",
                  fontSize: "0.85rem",
                  marginBottom: "18px",
                }}>{error}</div>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.8rem", fontWeight: 500, display: "block", marginBottom: "6px" }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    className="glass-input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="btn-brand"
                  disabled={loading}
                  style={{ width: "100%", marginTop: "4px" }}
                >
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <p style={{ textAlign: "center", marginTop: "24px", fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
                <Link href="/login" style={{ color: "#3D81E3", textDecoration: "none" }}>← Back to Login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
