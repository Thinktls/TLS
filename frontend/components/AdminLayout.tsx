"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout, getFullName } from "@/lib/auth";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";

const nav = [
  { href: "/admin",                  label: "Dashboard" },
  { href: "/admin/rounds",           label: "Bid Rounds" },
  { href: "/admin/buyers",           label: "Buyers" },
  { href: "/admin/buyers/compare",   label: "Buyer Compare" },
  { href: "/admin/buyers/fluff",     label: "Fluff Settings" },
  { href: "/admin/reports",          label: "Reports" },
  { href: "/admin/query",            label: "AI Query" },
  { href: "/admin/guide",            label: "Admin Guide" },
];

interface NotifItem {
  id: number;
  title: string;
  body: string | null;
  category: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

const CATEGORY_DOT: Record<string, string> = {
  info: "#60a5fa",
  success: "#34d399",
  warning: "#fbbf24",
  error: "#f87171",
};

function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchCount() {
    try {
      const res = await api.get("/notifications/unread-count");
      setCount(res.data.count);
    } catch { /* not logged in yet */ }
  }

  async function openFeed() {
    if (open) { setOpen(false); return; }
    try {
      const res = await api.get("/notifications", { params: { limit: 20 } });
      setItems(res.data);
    } catch { setItems([]); }
    setOpen(true);
  }

  async function markRead(id: number) {
    await api.patch(`/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await api.patch("/notifications/read-all");
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setCount(0);
  }

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <button
        onClick={openFeed}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          padding: "6px 10px",
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: "6px",
          color: "rgba(255,255,255,0.65)", fontSize: "1rem",
          position: "relative",
        }}
        title="Notifications"
      >
        🔔
        {count > 0 && (
          <span style={{
            position: "absolute", top: "-5px", right: "-5px",
            background: "#ef4444", color: "white",
            fontSize: "0.6rem", fontWeight: 700,
            borderRadius: "100px", padding: "1px 5px",
            minWidth: "16px", textAlign: "center",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: "340px", maxHeight: "420px",
          background: "#111114",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "14px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          zIndex: 9999, overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "white" }}>Notifications</span>
            {count > 0 && (
              <button
                onClick={markAllRead}
                style={{ fontSize: "0.72rem", color: "#60a5fa", background: "none", border: "none", cursor: "pointer" }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {items.length === 0 && (
              <p style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.25)", fontSize: "0.82rem" }}>
                No notifications
              </p>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                onClick={() => { if (!n.read) markRead(n.id); if (n.link) window.location.href = n.link; }}
                style={{
                  padding: "12px 16px",
                  cursor: n.link ? "pointer" : "default",
                  background: n.read ? "transparent" : "rgba(61,129,227,0.05)",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  display: "flex", gap: "10px", alignItems: "flex-start",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(61,129,227,0.05)"; }}
              >
                <div style={{
                  width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, marginTop: "5px",
                  background: n.read ? "rgba(255,255,255,0.12)" : (CATEGORY_DOT[n.category] || "#60a5fa"),
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.82rem", fontWeight: n.read ? 400 : 600, color: n.read ? "rgba(255,255,255,0.55)" : "white", margin: "0 0 3px", lineHeight: 1.3 }}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.35)", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.body}
                    </p>
                  )}
                  <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.25)", margin: 0 }}>{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function isNavActive(navHref: string, currentPath: string, allNav: typeof nav): boolean {
  if (currentPath === navHref) return true;
  if (!currentPath.startsWith(navHref + "/")) return false;
  // Prefix match only if no more-specific nav item also claims this path
  return !allNav.some((other) => other.href !== navHref && currentPath.startsWith(other.href));
}

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
            const active = isNavActive(n.href, path, nav);
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
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          padding: "14px 48px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <NotificationBell />
        </div>
        <div style={{ padding: "32px 48px", flex: 1 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
