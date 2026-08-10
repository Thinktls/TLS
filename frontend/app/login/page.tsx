"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import api from "@/lib/api";
import { saveAuth } from "@/lib/auth";

const LANDING_URL = "/";
const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4";

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="white">
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [warmState, setWarmState] = useState<"warming" | "ready" | "slow">("warming");

  useEffect(() => {
    const slowTimer = setTimeout(() => setWarmState("slow"), 4000);

    // /auth/me wakes Render and tells us when the server is actually ready
    api.get("/auth/me").catch(() => {}).finally(() => {
      clearTimeout(slowTimer);
      setWarmState("ready");
    });

    return () => clearTimeout(slowTimer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { email, password });
      saveAuth(res.data);
      router.push(res.data.role === "admin" ? "/admin" : "/portal");
      // Leave the button in its "Signing in…" state through the redirect — resetting it here
      // would briefly flash "Sign In" again before the new page mounts.
    } catch (err: unknown) {
      // On ANY failure the button must return to the enabled "Sign In" state so the user can
      // retry immediately. Without this the button stayed stuck on "Signing in…" (disabled)
      // after a wrong password, timeout, or cold-start error — which felt like a frozen app.
      setLoading(false);
      // Clear the password so the field is empty for the retry, rather than leaving the old dots.
      setPassword("");
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401) {
          setError("Invalid email or password.");
        } else if (err.code === "ECONNABORTED") {
          setError("Server is starting up — please wait a moment and try again.");
        } else if (!status) {
          setError("Cannot reach server. Please check your connection and try again.");
        } else {
          setError(`Login failed (error ${status}). Please try again.`);
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    }
  }

  return (
    <>
      <style>{`
        .glass-card {
          background: rgba(10, 10, 10, 0.55);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 28px;
          padding: 44px 40px;
          transition: border-color 0.3s;
        }
        .glass-card:hover {
          border-color: rgba(255,255,255,0.18);
        }
        /* The login card is dark by design (video background), but .glass-input's text colour
           follows the app theme — so in LIGHT mode the typed email/password rendered as
           near-black text on this dark card and was unreadable. Pin the login inputs to light
           text regardless of theme. Scoped to .glass-card so no other page is affected. */
        .glass-card .glass-input {
          color: #ffffff;
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.18);
          -webkit-text-fill-color: #ffffff;
        }
        .glass-card .glass-input::placeholder { color: rgba(255,255,255,0.45); }
        .glass-card .glass-input:focus {
          background: rgba(255,255,255,0.10);
          border-color: rgba(61,129,227,0.7);
        }
        /* Chrome autofill otherwise repaints the field near-white with dark text. */
        .glass-card .glass-input:-webkit-autofill,
        .glass-card .glass-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 1000px rgba(30,34,44,0.95) inset;
          caret-color: #ffffff;
        }
        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          transition: color 0.2s;
        }
        .back-link:hover { color: white; }
        .submit-btn {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          background: linear-gradient(135deg, #3D81E3 0%, #5a6cf5 100%);
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          border: none;
          cursor: pointer;
          letter-spacing: -0.01em;
          box-shadow: 0 2px 12px rgba(61,129,227,0.2);
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          font-family: Inter, system-ui, sans-serif;
          margin-top: 8px;
        }
        .submit-btn:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(61,129,227,0.28);
        }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0f", overflow: "hidden", position: "relative" }}>

        {/* Same fullscreen video as landing page */}
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <video
            autoPlay loop muted playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }}
            src={VIDEO_SRC}
          />
          {/* Dark gradient overlay so card is readable */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(10,10,15,0.5) 0%, rgba(10,10,15,0.7) 100%)",
          }} />
        </div>

        {/* Top navbar — same style as landing */}
        <nav style={{
          position: "relative", zIndex: 10,
          padding: "20px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.2)",
          backdropFilter: "blur(10px)",
        }}>
          <a href={LANDING_URL} style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <LogoMark size={22} />
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.01em" }}>
              ThinkTLS
            </span>
          </a>
          <a href={LANDING_URL} className="back-link">
            ← Back to home
          </a>
        </nav>

        {/* Centered card */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative", zIndex: 1 }}>
          <div style={{ width: "100%", maxWidth: "420px" }}>

            {/* Logo + headline */}
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "56px", height: "56px", borderRadius: "18px",
                background: "linear-gradient(135deg, #3D81E3, #5a6cf5)",
                marginBottom: "20px",
                boxShadow: "0 4px 16px rgba(61,129,227,0.2)",
              }}>
                <LogoMark size={28} />
              </div>

              <h1 style={{ fontSize: "2.6rem", fontWeight: 700, letterSpacing: "-0.05em", margin: 0, lineHeight: 1, color: "var(--text-1)" }}>
                ThinkTLS
              </h1>
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.35)", marginTop: "10px", letterSpacing: "0.01em" }}>
                Bid Desk · Sign in to continue
              </p>
            </div>

            {/* Glass card */}
            <div className="glass-card">
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 500, color: "rgba(255,255,255,0.45)", marginBottom: "8px" }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@thinktls.com"
                    className="glass-input"
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 500, color: "rgba(255,255,255,0.45)", marginBottom: "8px" }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
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

                <button type="submit" disabled={loading} className="submit-btn">
                  {loading ? "Signing in…" : "Sign In →"}
                </button>

                {warmState === "slow" && !loading && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "8px 12px",
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    borderRadius: "10px",
                    fontSize: "0.75rem", color: "#fbbf24",
                  }}>
                    <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: "#fbbf24", animation: "pulse 1.4s infinite" }} />
                    Server is starting up — sign in will work in a few seconds
                  </div>
                )}
              </form>

              <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.07)", textAlign: "center", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <a href={LANDING_URL} className="back-link" style={{ fontSize: "0.78rem" }}>
                  ← Return to ThinkTLS home
                </a>
                <a href="/forgot-password" style={{ fontSize: "0.78rem", color: "rgba(61,129,227,0.8)", textDecoration: "none" }}>
                  Forgot password?
                </a>
              </div>
            </div>

            <p style={{ textAlign: "center", marginTop: "20px", fontSize: "0.72rem", color: "rgba(255,255,255,0.18)" }}>
              Authorized ThinkTLS users only
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
