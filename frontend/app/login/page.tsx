"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { email, password });
      saveAuth(res.data);
      router.push(res.data.role === "admin" ? "/admin" : "/portal");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setError("Invalid email or password.");
      } else if (!status) {
        setError("Cannot reach server. Please try again in a moment.");
      } else {
        setError(`Login failed (error ${status}). Please try again.`);
      }
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
          background: linear-gradient(135deg, #3D81E3 0%, #00c6fb 100%);
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          border: none;
          cursor: pointer;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 28px rgba(61,129,227,0.35);
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          font-family: Inter, system-ui, sans-serif;
          margin-top: 8px;
        }
        .submit-btn:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 8px 36px rgba(61,129,227,0.45);
        }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0c0c0c", overflow: "hidden", position: "relative" }}>

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
            background: "linear-gradient(to bottom, rgba(12,12,12,0.5) 0%, rgba(12,12,12,0.7) 100%)",
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
                background: "linear-gradient(135deg, rgba(61,129,227,0.9), rgba(0,210,255,0.9))",
                marginBottom: "20px",
                boxShadow: "0 0 48px rgba(61,129,227,0.4)",
              }}>
                <LogoMark size={28} />
              </div>

              <h1 style={{ fontSize: "2.6rem", fontWeight: 700, letterSpacing: "-0.05em", margin: 0, lineHeight: 1, color: "white" }}>
                Think<span className="shiny-text">TLS</span>
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
                  {loading ? "Signing in..." : "Sign In →"}
                </button>
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
