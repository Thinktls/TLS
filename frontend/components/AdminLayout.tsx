"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, getFullName } from "@/lib/auth";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeProvider";
import ChatWidget from "@/components/ChatWidget";

/* ── Auth guard ──────────────────────────────────────────────── */
function useAuthGuard() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role  = localStorage.getItem("role");
    // Fast path: valid session already in localStorage
    if (token && role === "admin") return;
    // Slow path: token missing or stale — verify via API (works with httpOnly cookie too)
    api.get("/auth/me")
      .then(res => {
        if (res.data.role !== "admin") { router.replace("/login"); return; }
        // Repopulate UI fields so the layout renders correctly
        localStorage.setItem("role",     res.data.role);
        localStorage.setItem("user_id",  String(res.data.id));
        localStorage.setItem("full_name", res.data.full_name);
      })
      .catch(() => router.replace("/login"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* ── Nav icons ──────────────────────────────────────────────── */
const Icons = {
  Dashboard: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  Rounds: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Buyers: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Compare: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Fluff: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
    </svg>
  ),
  Reports: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  AI: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Guide: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
};

const nav = [
  { href: "/admin",                label: "Dashboard",      Icon: Icons.Dashboard },
  { href: "/admin/rounds",         label: "Bid Rounds",     Icon: Icons.Rounds },
  { href: "/admin/buyers",         label: "Buyers",         Icon: Icons.Buyers },
  { href: "/admin/buyers/compare", label: "Buyer Compare",  Icon: Icons.Compare },
  { href: "/admin/buyers/fluff",   label: "Fluff Settings", Icon: Icons.Fluff },
  { href: "/admin/reports",        label: "Reports",        Icon: Icons.Reports },
  { href: "/admin/query",          label: "AI Query",       Icon: Icons.AI },
  { href: "/admin/guide",          label: "Admin Guide",    Icon: Icons.Guide },
];

/* ── Notifications ──────────────────────────────────────────── */
interface NotifItem {
  id: number; title: string; body: string | null;
  category: string; link: string | null; read: boolean; created_at: string;
}
const CATEGORY_COLOR: Record<string, string> = {
  info: "#60a5fa", success: "#34d399", warning: "#fbbf24", error: "#f87171",
};

function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  async function fetchCount() {
    try { const r = await api.get("/notifications/unread-count"); setCount(r.data.count); } catch {}
  }
  async function openFeed() {
    if (open) { setOpen(false); return; }
    try { const r = await api.get("/notifications", { params: { limit: 20 } }); setItems(r.data); } catch { setItems([]); }
    setOpen(true);
  }
  async function markRead(id: number) {
    await api.patch(`/notifications/${id}/read`);
    setItems(p => p.map(n => n.id === id ? { ...n, read: true } : n));
    setCount(c => Math.max(0, c - 1));
  }
  async function markAll() {
    await api.patch("/notifications/read-all");
    setItems(p => p.map(n => ({ ...n, read: true }))); setCount(0);
  }
  useEffect(() => { fetchCount(); const t = setInterval(fetchCount, 30_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function timeAgo(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "just now"; if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={openFeed} style={{
        position: "relative", background: "var(--control-bg)", border: "1px solid var(--border)",
        borderRadius: "8px", width: "34px", height: "34px", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)",
        transition: "all 0.15s",
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--control-hover-bg)"; (e.currentTarget as HTMLElement).style.color = "var(--text-1)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--control-bg)"; (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}
        title="Notifications"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && (
          <span style={{
            position: "absolute", top: "-5px", right: "-5px", minWidth: "16px", height: "16px",
            background: "var(--red)", color: "var(--text-1)",
            fontSize: "0.58rem", fontWeight: 700, borderRadius: "100px", padding: "0 4px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{count > 99 ? "99+" : count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, width: "340px", maxHeight: "420px",
          background: "var(--bg-1)", border: "1px solid var(--border-mid)", borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)", zIndex: 9999, overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-1)" }}>Notifications</span>
            {count > 0 && <button onClick={markAll} style={{ fontSize: "0.72rem", color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}>Mark all read</button>}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {items.length === 0 && <p style={{ textAlign: "center", padding: "32px 0", color: "var(--text-4)", fontSize: "0.82rem" }}>All caught up</p>}
            {items.map(n => (
              <div key={n.id} onClick={() => { if (!n.read) markRead(n.id); if (n.link) window.location.href = n.link; }}
                style={{ padding: "12px 16px", cursor: n.link ? "pointer" : "default", background: n.read ? "transparent" : "rgba(61,129,227,0.06)", borderBottom: "1px solid var(--border)", display: "flex", gap: "10px", alignItems: "flex-start", transition: "background 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.read ? "transparent" : "rgba(61,129,227,0.06)"; }}
              >
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, marginTop: "6px", background: n.read ? "rgba(255,255,255,0.1)" : (CATEGORY_COLOR[n.category] || "#60a5fa") }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.8rem", fontWeight: n.read ? 400 : 600, color: n.read ? "var(--text-3)" : "var(--text-1)", margin: "0 0 2px", lineHeight: 1.35 }}>{n.title}</p>
                  {n.body && <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</p>}
                  <p style={{ fontSize: "0.67rem", color: "var(--text-4)", margin: 0 }}>{timeAgo(n.created_at)} ago</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Active check ────────────────────────────────────────────── */
// Pick the nav item with the longest (most specific) matching prefix.
// Bug: the old check yielded to ANY other match — "/admin" (len 6) beat
// "/admin/rounds" (len 14) for paths like "/admin/rounds/5/page", leaving
// nothing highlighted. Fix: only defer to a competing item if its href is
// strictly longer (more specific) than ours.
function isNavActive(href: string, path: string): boolean {
  if (path === href) return true;
  if (!path.startsWith(href + "/")) return false;
  return !nav.some(
    n => n.href !== href && n.href.length > href.length && path.startsWith(n.href)
  );
}

/* ── Logo ────────────────────────────────────────────────────── */
function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 256 256" fill="white">
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}

/* ── Layout ──────────────────────────────────────────────────── */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useAuthGuard();
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const initials = getFullName().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "A";

  function closeSidebar() { setSidebarOpen(false); }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>

      {/* Mobile overlay — closes sidebar on tap */}
      <div className={`mobile-overlay${sidebarOpen ? " visible" : ""}`} onClick={closeSidebar} aria-hidden />

      {/* ── Sidebar ── */}
      <aside className={`sidebar-panel${sidebarOpen ? " sidebar-open" : ""}`}>
        {/* Top accent line */}
        <div style={{ height: "2px", background: "linear-gradient(90deg, var(--brand), transparent)", flexShrink: 0 }} />

        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--border)" }}>
          <Link href="/admin" onClick={closeSidebar} style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0,
              background: "linear-gradient(135deg, #3D81E3, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(61,129,227,0.15)",
            }}>
              <LogoMark />
            </div>
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>ThinkTLS</div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-4)", marginTop: "1px", letterSpacing: "0.03em" }}>BID DESK</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "1px", overflowY: "auto" }}>
          <div className="section-label" style={{ marginTop: "4px" }}>Overview</div>
          {nav.slice(0, 2).map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={closeSidebar} className={`nav-item${isNavActive(href, path) ? " active" : ""}`}>
              <Icon />{label}
            </Link>
          ))}

          <div className="section-label">People</div>
          {nav.slice(2, 5).map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={closeSidebar} className={`nav-item${isNavActive(href, path) ? " active" : ""}`}>
              <Icon />{label}
            </Link>
          ))}

          <div className="section-label">Tools</div>
          {nav.slice(5).map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={closeSidebar} className={`nav-item${isNavActive(href, path) ? " active" : ""}`}>
              <Icon />{label}
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
            background: "linear-gradient(135deg, rgba(61,129,227,0.3), rgba(139,92,246,0.3))",
            border: "1px solid rgba(61,129,227,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.72rem", fontWeight: 700, color: "#a0bfff",
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {getFullName() || "Admin"}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Link href="/admin/profile" onClick={closeSidebar} style={{ fontSize: "0.68rem", color: "var(--text-4)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#a0bfff"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-4)"; }}
              >Account</Link>
              <span style={{ fontSize: "0.68rem", color: "var(--border)" }}>·</span>
              <button onClick={logout} style={{ fontSize: "0.68rem", color: "var(--text-4)", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-4)"; }}
              >Sign out</button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{
          height: "52px", display: "flex", alignItems: "center",
          padding: "0 20px", borderBottom: "1px solid var(--border)",
          background: "var(--topbar-bg)", backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 40, flexShrink: 0, gap: "8px",
        }}>
          {/* Hamburger — visible only on mobile via CSS */}
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
          <NotificationBell />
        </div>

        {/* Content */}
        <div className="page-content">
          {children}
        </div>
      </div>
      <ChatWidget role="admin" />
    </div>
  );
}
