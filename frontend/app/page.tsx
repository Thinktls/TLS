"use client";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/icons";
import { useRouter } from "next/navigation";

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="#ffffff">
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4";

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: "rounds",
    title: "Bid Round Management",
    desc: "Create rounds, assign buyers, upload master catalogs, and manage the full bid lifecycle from one dashboard.",
  },
  {
    icon: "ai",
    title: "AI Powered Matching",
    desc: "Three tier engine: exact match, then fuzzy (RapidFuzz), then Claude AI — automatically resolves part number variants.",
  },
  {
    icon: "success",
    title: "Winner Selection",
    desc: "Best price winner per line with configurable fluff pricing per buyer. Full exception review queue.",
  },
  {
    icon: "reports",
    title: "Analytics & Exports",
    desc: "Deal comparison matrix, buyer scorecards, margin reports. Export to Excel, CSV, or push direct to Razor ERP.",
  },
  {
    icon: "mail",
    title: "Email Integration",
    desc: "SendGrid powered buyer invites, award sheets, and inbound email bid submission via webhook.",
  },
  {
    icon: "userCheck",
    title: "Role Based Access",
    desc: "Separate admin and buyer portals. Buyers only see their assigned rounds and their own results.",
  },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (token && role === "admin") router.replace("/admin");
    else if (token && role === "buyer") router.replace("/portal");
    // else stay on landing page
  }, [router]);

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
        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 16px 36px;
          border-radius: 14px;
          background: linear-gradient(135deg, #3D81E3 0%, #00c6fb 100%);
          color: #ffffff;
          font-weight: 700;
          font-size: 1rem;
          border: none;
          cursor: pointer;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 32px rgba(61,129,227,0.4);
          text-decoration: none;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .cta-btn:hover {
          opacity: 0.92;
          transform: translateY(-2px);
          box-shadow: 0 8px 48px rgba(61,129,227,0.5);
        }
        .outline-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 15px 32px;
          border-radius: 14px;
          background: transparent;
          color: #ffffff;
          font-weight: 600;
          font-size: 1rem;
          border: 1px solid rgba(255,255,255,0.12);
          cursor: pointer;
          text-decoration: none;
          transition: border-color 0.2s, color 0.2s, transform 0.15s;
        }
        .outline-btn:hover {
          border-color: rgba(255,255,255,0.12);
          color: #ffffff;
          transform: translateY(-2px);
        }
        .feature-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 28px 24px;
          transition: border-color 0.3s, background 0.3s, transform 0.2s;
        }
        .feature-card:hover {
          border-color: rgba(61,129,227,0.35);
          background: rgba(61,129,227,0.06);
          transform: translateY(-3px);
        }
        .stat-card {
          text-align: center;
          padding: 24px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0c0c0c", color: "#ffffff", fontFamily: "Inter, system-ui, sans-serif", overflowX: "hidden" }}>

        {/* Background video */}
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <video
            autoPlay loop muted playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.25 }}
            src={VIDEO_SRC}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(12,12,12,0.6) 0%, rgba(12,12,12,0.85) 60%, #0c0c0c 100%)",
          }} />
        </div>

        {/* Navbar */}
        <nav style={{
          position: "relative", zIndex: 10,
          padding: "20px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <LogoMark size={22} />
            <span style={{ fontSize: "0.95rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
              Think<span style={{ color: "#00c6fb" }}>TLS</span>
            </span>
            <span style={{
              marginLeft: "6px",
              fontSize: "0.68rem",
              fontWeight: 500,
              color: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: "6px",
              padding: "2px 8px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}>
              Bid Desk
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a href="/login" className="outline-btn" style={{ padding: "10px 24px", fontSize: "0.88rem" }}>Sign In <Icon name="arrowRight" size={16} /></a>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "110px 24px 80px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "rgba(61,129,227,0.1)",
            border: "1px solid rgba(61,129,227,0.25)",
            borderRadius: "100px",
            padding: "6px 16px",
            fontSize: "0.78rem",
            color: "rgba(164,244,253,0.9)",
            marginBottom: "32px",
            letterSpacing: "0.02em",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00c6fb", display: "inline-block" }} />
            Intelligent Procurement · Built for ThinkTLS
          </div>

          <h1 style={{ fontSize: "clamp(2.8rem, 6vw, 5.2rem)", fontWeight: 800, letterSpacing: "-0.05em", margin: "0 0 24px", lineHeight: 1.05 }}>
            The Smarter Way to<br />
            <span className="shiny-text">Run Bid Rounds</span>
          </h1>

          <p style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", color: "rgba(255,255,255,0.5)", maxWidth: "600px", margin: "0 auto 48px", lineHeight: 1.7, fontWeight: 400 }}>
            Automate buyer bid collection, AI powered part matching, winner selection,
            and deal approval — all in one cinematic platform.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
            <a href="/login" className="cta-btn">Sign In to Bid Desk <Icon name="arrowRight" size={18} /></a>
            <a href="#features" className="outline-btn">
              See How It Works
            </a>
          </div>
        </section>

        {/* Stats row */}
        <section style={{ position: "relative", zIndex: 1, maxWidth: "900px", margin: "0 auto 100px", padding: "0 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
            {[
              { value: "3 Tier AI", label: "Part Matching Engine" },
              { value: "100%", label: "Buyer Data Isolation" },
              { value: "9 Formats", label: "Export Options" },
              { value: "Real Time", label: "Processing & Analytics" },
            ].map((s) => (
              <div key={s.label} className="stat-card">
                <div style={{ fontSize: "1.9rem", fontWeight: 800, letterSpacing: "-0.04em", color: "#00c6fb", marginBottom: "6px" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.01em" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" style={{ position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto 100px", padding: "0 24px" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(1.8rem, 3vw, 2.6rem)", fontWeight: 800, letterSpacing: "-0.04em", marginBottom: "16px" }}>
            Everything You Need
          </h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "56px", fontSize: "1rem" }}>
            From bid creation to ERP push — fully automated.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <div style={{ marginBottom: "14px", width: 46, height: 46, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,198,251,0.12)", color: "#00c6fb", border: "1px solid rgba(0,198,251,0.25)" }}><Icon name={f.icon} size={24} /></div>
                <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "8px", letterSpacing: "-0.02em" }}>{f.title}</div>
                <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA banner */}
        <section style={{ position: "relative", zIndex: 1, maxWidth: "800px", margin: "0 auto 80px", padding: "0 24px" }}>
          <div style={{
            textAlign: "center",
            background: "rgba(61,129,227,0.08)",
            border: "1px solid rgba(61,129,227,0.2)",
            borderRadius: "28px",
            padding: "56px 40px",
          }}>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 800, letterSpacing: "-0.04em", marginBottom: "16px" }}>
              Ready to get started?
            </h2>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "36px", fontSize: "0.95rem" }}>
              Sign in with your ThinkTLS credentials to access the Bid Desk.
            </p>
            <a href="/login" className="cta-btn">Sign In to Bid Desk <Icon name="arrowRight" size={18} /></a>
          </div>
        </section>

        {/* Footer */}
        <footer style={{
          position: "relative", zIndex: 1,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "28px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <LogoMark size={16} />
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", letterSpacing: "-0.01em" }}>
              ThinkTLS Bid Desk
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
            Authorized users only · Internal platform
          </span>
        </footer>
      </div>
    </>
  );
}
