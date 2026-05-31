"use client";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";
import { getFullName } from "@/lib/auth";

interface Round {
  id: number; name: string; commodity: string; status: string;
  total_line_items: number; master_file_uploaded: boolean; submission_deadline: string | null;
}
interface Buyer { id: number; is_active: boolean; }

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  draft:      { label: "Draft",      dot: "rgba(255,255,255,0.3)", badge: "badge-draft" },
  open:       { label: "Open",       dot: "#10b981",              badge: "badge-open" },
  closed:     { label: "Closed",     dot: "#f59e0b",              badge: "badge-closed" },
  processing: { label: "Processing", dot: "#60a5fa",              badge: "badge-processing" },
  complete:   { label: "Complete",   dot: "#a78bfa",              badge: "badge-complete" },
};

const COMMODITY_ICON: Record<string, string> = {
  laptops: "💻", desktops: "🖥", servers: "🖧", networking: "🌐",
  storage: "💾", peripherals: "🖱", other: "📦",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function AdminDashboard() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const name = getFullName().split(" ")[0] || "Admin";

  useEffect(() => {
    Promise.all([
      api.get("/rounds/").then(r => setRounds(r.data)),
      api.get("/auth/buyers").then(r => setBuyers(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "var(--text-4)", fontSize: "0.82rem" }}>Loading dashboard…</p>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  );

  const openRounds    = rounds.filter(r => r.status === "open");
  const completeRounds = rounds.filter(r => r.status === "complete");
  const processing    = rounds.filter(r => r.status === "processing");
  const activeB       = buyers.filter(b => b.is_active);
  const recent        = rounds.slice(0, 6);

  const stats = [
    { label: "Total Rounds",  value: rounds.length,       sub: "all time",            gradient: "linear-gradient(135deg, #3D81E3, #6366f1)", icon: "🗂" },
    { label: "Open Now",      value: openRounds.length,   sub: "accepting bids",      gradient: "linear-gradient(135deg, #10b981, #34d399)",  icon: "✅" },
    { label: "Processing",    value: processing.length,   sub: "running matches",     gradient: "linear-gradient(135deg, #f59e0b, #fbbf24)",  icon: "⚙️" },
    { label: "Active Buyers", value: activeB.length,      sub: "registered buyers",   gradient: "linear-gradient(135deg, #8b5cf6, #a78bfa)",  icon: "👥" },
  ];

  return (
    <AdminLayout>
      <div style={{ maxWidth: "960px" }} className="animate-in">

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <p style={{ fontSize: "0.78rem", color: "var(--text-4)", margin: "0 0 4px", letterSpacing: "0.02em" }}>{greeting()},</p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "white", letterSpacing: "-0.04em", margin: "0 0 6px", lineHeight: 1.1 }}>
            {name} <span style={{ backgroundImage: "linear-gradient(135deg, #3D81E3, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>↗</span>
          </h1>
          <p style={{ fontSize: "0.83rem", color: "var(--text-3)", margin: 0 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "32px" }}>
          {stats.map(({ label, value, sub, gradient, icon }) => (
            <div key={label} className="stat-card">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "10px",
                  background: gradient, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem", boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                }}>{icon}</div>
              </div>
              <p style={{ fontSize: "2.2rem", fontWeight: 800, color: "white", margin: "0 0 4px", letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-3)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
              <p style={{ fontSize: "0.7rem", color: "var(--text-4)", margin: 0 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "32px", flexWrap: "wrap" }}>
          <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Bid Round
          </Link>
          <Link href="/admin/buyers" className="btn-ghost" style={{ textDecoration: "none" }}>Manage Buyers</Link>
          <Link href="/admin/query" className="btn-ghost" style={{ textDecoration: "none" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            AI Query
          </Link>
          <Link href="/admin/reports" className="btn-ghost" style={{ textDecoration: "none" }}>Reports</Link>
        </div>

        {/* Two-column lower section */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "20px", alignItems: "start" }}>

          {/* Recent rounds */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h2 style={{ fontSize: "0.88rem", fontWeight: 700, color: "white", margin: 0, letterSpacing: "-0.01em" }}>Recent Rounds</h2>
              <Link href="/admin/rounds" style={{ fontSize: "0.75rem", color: "var(--text-4)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "white"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-4)"; }}
              >View all <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></Link>
            </div>

            {recent.length === 0 ? (
              <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-lg)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--text-4)", fontSize: "0.88rem", margin: "0 0 12px" }}>No rounds yet</p>
                <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none", fontSize: "0.82rem" }}>Create first round →</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {recent.map(r => {
                  const meta = STATUS_META[r.status] || STATUS_META.draft;
                  return (
                    <Link key={r.id} href={`/admin/rounds/${r.id}`} style={{ textDecoration: "none" }}>
                      <div style={{
                        background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                        padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px",
                        transition: "all 0.15s",
                      }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(255,255,255,0.15)"; el.style.background = "var(--bg-3)"; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.background = "var(--bg-2)"; }}
                      >
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0,
                          background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem",
                        }}>{COMMODITY_ICON[r.commodity] || "📦"}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, color: "white", margin: "0 0 2px", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                          <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: 0 }}>
                            {r.total_line_items.toLocaleString()} items
                            {r.submission_deadline && ` · Due ${new Date(r.submission_deadline).toLocaleDateString()}`}
                          </p>
                        </div>
                        <span className={`badge ${meta.badge}`}>{r.status}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column — summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>Round Status</p>
              {Object.entries(STATUS_META).map(([key, { label, dot }]) => {
                const cnt = rounds.filter(r => r.status === key).length;
                const pct = rounds.length ? Math.round(cnt / rounds.length * 100) : 0;
                return (
                  <div key={key} style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot }} />
                        <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{label}</span>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "white", fontWeight: 600 }}>{cnt}</span>
                    </div>
                    <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "100px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: dot, borderRadius: "100px", transition: "width 0.6s" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Quick Links</p>
              {[
                { label: "Bid Comparison", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/comparison` : "/admin/rounds", icon: "📊" },
                { label: "Approve Deals", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/deals` : "/admin/rounds", icon: "✅" },
                { label: "Buyer Scoring", href: "/admin/buyers/compare", icon: "🏆" },
                { label: "Export Center", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/export` : "/admin/rounds", icon: "📥" },
              ].map(({ label, href, icon }) => (
                <Link key={label} href={href} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "white"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ""; }}
                >
                  <span style={{ fontSize: "0.85rem" }}>{icon}</span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>{label}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "auto", color: "var(--text-4)" }}><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
