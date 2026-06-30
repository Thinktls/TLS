"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, getFullName } from "@/lib/auth";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeProvider";
import ChatWidget from "@/components/ChatWidget";
import BuyerTour from "@/components/BuyerTour";

/* ── Auth guard ──────────────────────────────────────────────── */
function useAuthGuard() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role  = localStorage.getItem("role");
    if (token && (role === "buyer" || role === "admin")) return;
    api.get("/auth/me")
      .then(res => {
        if (!["buyer", "admin"].includes(res.data.role)) { router.replace("/login"); return; }
        localStorage.setItem("role",     res.data.role);
        localStorage.setItem("user_id",  String(res.data.id));
        localStorage.setItem("full_name", res.data.full_name);
      })
      .catch(() => router.replace("/login"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const nav = [
  {
    href: "/portal", label: "Dashboard",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  },
  {
    href: "/portal/bid", label: "Submit Bid",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  },
  {
    href: "/portal/submission", label: "My Submission",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  {
    href: "/portal/results", label: "My Results",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  },
  {
    href: "/portal/profile", label: "Profile",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
];

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 256 256" fill="white">
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  useAuthGuard();
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const name = getFullName();
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() || "B";

  function closeSidebar() { setSidebarOpen(false); }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>

      {/* Mobile overlay */}
      <div className={`mobile-overlay${sidebarOpen ? " visible" : ""}`} onClick={closeSidebar} aria-hidden />

      {/* Sidebar */}
      <aside className={`sidebar-panel${sidebarOpen ? " sidebar-open" : ""}`} style={{ width: "210px" }}>
        {/* Accent line */}
        <div style={{ height: "2px", background: "linear-gradient(90deg, var(--brand), transparent)" }} />

        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "9px",
              background: "linear-gradient(135deg, #3D81E3, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(61,129,227,0.15)",
            }}><LogoMark /></div>
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>ThinkTLS</div>
              <div style={{ fontSize: "0.62rem", color: "var(--text-4)", marginTop: "1px", letterSpacing: "0.04em" }}>BUYER PORTAL</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "1px" }}>
          <div className="section-label" style={{ marginTop: "4px" }}>Navigation</div>
          {nav.map(({ href, label, icon }) => {
            const active = path === href || (href !== "/portal" && path.startsWith(href));
            const tourAttr =
              href === "/portal/bid"        ? "nav-submit-bid"  :
              href === "/portal/submission" ? "nav-submission"  :
              href === "/portal/results"    ? "nav-results"     : undefined;
            return (
              <Link key={href} href={href} onClick={closeSidebar} className={`nav-item${active ? " active" : ""}`}
                {...(tourAttr ? { "data-tour": tourAttr } : {})}>
                {icon}{label}
              </Link>
            );
          })}
        </nav>

        {/* Help callout */}
        <div style={{ margin: "0 10px 10px", padding: "12px 14px", background: "rgba(61,129,227,0.08)", border: "1px solid rgba(61,129,227,0.15)", borderRadius: "10px" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 3px" }}>Need help?</p>
          <p style={{ fontSize: "0.68rem", color: "var(--text-4)", margin: 0, lineHeight: 1.4 }}>
            Email <span style={{ color: "var(--text-3)" }}>bids@thinktls.com</span>
          </p>
        </div>

        {/* User footer */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
            background: "linear-gradient(135deg, rgba(61,129,227,0.3), rgba(99,102,241,0.3))",
            border: "1px solid rgba(61,129,227,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.72rem", fontWeight: 700, color: "#a0bfff",
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || "Buyer"}</p>
            <button onClick={logout} style={{ fontSize: "0.68rem", color: "var(--text-4)", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-4)"; }}
            >Sign out</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div style={{
          height: "52px", display: "flex", alignItems: "center",
          padding: "0 20px", borderBottom: "1px solid var(--border)",
          background: "var(--topbar-bg)", backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 40, flexShrink: 0, gap: "8px",
        }}>
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle navigation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div style={{ flex: 1 }} />
          <ThemeToggle />
        </div>
        <div className="page-content" style={{ minWidth: 0, background: "var(--bg)" }}>
          {children}
        </div>
      </div>
      <ChatWidget role="buyer" />
      <BuyerTour />
    </div>
  );
}
