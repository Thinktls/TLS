"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout, getFullName } from "@/lib/auth";

const nav = [
  { href: "/admin",          label: "Dashboard" },
  { href: "/admin/rounds",   label: "Bid Rounds" },
  { href: "/admin/buyers",   label: "Buyers" },
  { href: "/admin/reports",  label: "Reports" },
  { href: "/admin/query",    label: "AI Query" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0c0c0c" }}>
      {/* Sidebar */}
      <aside style={{
        width: "220px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,255,255,0.02)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* Logo */}
        <div style={{ padding: "28px 24px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "8px",
              background: "#3D81E3",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "13px", fontWeight: 700, color: "white",
            }}>T</div>
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "white", letterSpacing: "-0.01em" }}>ThinkTLS</div>
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginTop: "1px" }}>Bid Desk Admin</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {nav.map((n) => {
            const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  display: "block",
                  padding: "9px 14px",
                  borderRadius: "9px",
                  fontSize: "0.875rem",
                  fontWeight: active ? 600 : 400,
                  color: active ? "white" : "rgba(255,255,255,0.5)",
                  background: active ? "rgba(61,129,227,0.18)" : "transparent",
                  borderLeft: active ? "2px solid #3D81E3" : "2px solid transparent",
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {getFullName()}
          </p>
          <button
            onClick={logout}
            style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
