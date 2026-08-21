"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { saveAuth } from "@/lib/auth";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4";

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="#ffffff">
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}

function SetupPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [buyerName, setBuyerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  useEffect(() => {
    if (!token) { setTokenInvalid(true); setValidating(false); return; }
    api.get(`/auth/invite/validate?token=${token}`)
      .then((r) => { setBuyerName(r.data.buyer_name); setEmail(r.data.email); })
      .catch(() => setTokenInvalid(true))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/setup-password", { token, new_password: password });
      saveAuth(res.data);
      router.push("/portal");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to set password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes shiny {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .shiny-text {
          background-image: linear-gradient(to right,
            #091020 0%, #0B2551 12%, #A4F4FD 33%,
            #00d2ff 50%, #0B2551 68%, #091020 88%, #091020 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: shiny 5s linear infinite;
        }
        .setup-btn {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          background: linear-gradient(135deg, #3D81E3 0%, #00c6fb 100%);
          color: #ffffff;
          font-weight: 700;
          font-size: 0.95rem;
          border: none;
          cursor: pointer;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 28px rgba(61,129,227,0.35);
          transition: opacity 0.2s, transform 0.15s;
          font-family: Inter, system-ui, sans-serif;
        }
        .setup-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .setup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0c0c0c", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <video autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.3 }} src={VIDEO_SRC} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(12,12,12,0.55) 0%, rgba(12,12,12,0.75) 100%)" }} />
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative", zIndex: 1 }}>
          <div style={{ width: "100%", maxWidth: "420px" }}>
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "56px", height: "56px", borderRadius: "18px",
                background: "linear-gradient(135deg, rgba(61,129,227,0.9), rgba(0,210,255,0.9))",
                marginBottom: "20px",
                boxShadow: "0 0 48px rgba(61,129,227,0.4)",
              }}>
                <LogoMark size={28} />
              </div>
              <h1 style={{ fontSize: "2.4rem", fontWeight: 700, letterSpacing: "-0.05em", margin: 0, color: "#ffffff" }}>
                Think<span className="shiny-text">TLS</span>
              </h1>
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginTop: "10px" }}>
                {validating ? "Verifying your invite..." : tokenInvalid ? "Invalid invite link" : `Welcome, ${buyerName}`}
              </p>
            </div>

            {validating ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Checking invite...</div>
            ) : tokenInvalid ? (
              <div style={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "16px",
                padding: "28px",
                textAlign: "center",
              }}>
                <p style={{ color: "#f87171", fontWeight: 600, margin: "0 0 8px" }}>Invite link is invalid or expired</p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.83rem", margin: 0 }}>
                  Please ask your ThinkTLS administrator to resend your invite.
                </p>
              </div>
            ) : (
              <div style={{
                background: "rgba(10,10,10,0.55)",
                border: "1px solid rgba(255,255,255,0.13)",
                backdropFilter: "blur(24px)",
                borderRadius: "28px",
                padding: "44px 40px",
              }}>
                <p style={{ fontWeight: 600, color: "#ffffff", margin: "0 0 6px", fontSize: "1rem" }}>Set your password</p>
                <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", margin: "0 0 24px" }}>{email}</p>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 500, color: "rgba(255,255,255,0.5)", marginBottom: "8px" }}>
                      New Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Minimum 8 characters"
                      className="glass-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 500, color: "rgba(255,255,255,0.5)", marginBottom: "8px" }}>
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      className="glass-input"
                    />
                  </div>

                  {error && (
                    <div style={{
                      padding: "10px 14px",
                      background: "rgba(239,68,68,0.12)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      borderRadius: "10px",
                      fontSize: "0.82rem",
                      color: "#f87171",
                    }}>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="setup-btn" style={{ marginTop: "8px" }}>
                    {loading ? "Setting up..." : "Activate Account →"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0c0c0c" }} />}>
      <SetupPasswordInner />
    </Suspense>
  );
}
