"use client";
import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";
import { getFullName } from "@/lib/auth";
import { fmtDatetimeShort } from "@/lib/format";

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

const COMMODITY_ICON: Record<string, React.ReactNode> = {
  laptops:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  desktops:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  servers:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  networking: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>,
  storage:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>,
  peripherals:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  other:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
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
      <div style={{ maxWidth: "960px" }}>
        {/* Header skeleton */}
        <div style={{ marginBottom: "32px" }}>
          <div className="skeleton skeleton-text" style={{ width: "80px", marginBottom: "8px" }} />
          <div className="skeleton skeleton-title" style={{ width: "200px", height: "1.6rem", marginBottom: "8px" }} />
          <div className="skeleton skeleton-text" style={{ width: "140px" }} />
        </div>
        {/* KPI card skeletons */}
        <div className="stat-grid" style={{ marginBottom: "32px" }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "22px 24px" }}>
              <div className="skeleton skeleton-circle" style={{ width: "42px", height: "42px", marginBottom: "18px" }} />
              <div className="skeleton" style={{ width: "60px", height: "2rem", marginBottom: "8px" }} />
              <div className="skeleton skeleton-text" style={{ width: "80px", marginBottom: "4px" }} />
              <div className="skeleton skeleton-text" style={{ width: "50px" }} />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "20px", marginBottom: "20px" }}>
          <div className="skeleton skeleton-title" style={{ width: "120px", marginBottom: "16px" }} />
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="skeleton skeleton-row" style={{ marginBottom: i < 6 ? "4px" : 0 }} />
          ))}
        </div>
      </div>
    </AdminLayout>
  );

  const openRounds    = rounds.filter(r => r.status === "open");
  const completeRounds = rounds.filter(r => r.status === "complete");
  const processing    = rounds.filter(r => r.status === "processing");
  const activeB       = buyers.filter(b => b.is_active);
  const recent        = rounds.slice(0, 6);

  const stats: { label: string; value: number; sub: string; gradient: string; icon: React.ReactNode }[] = [
    {
      label: "Total Rounds", value: rounds.length, sub: "all time",
      gradient: "linear-gradient(135deg, #3D81E3, #5a6cf5)",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      label: "Open Now", value: openRounds.length, sub: "accepting bids",
      gradient: "linear-gradient(135deg, #059669, #10b981)",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    },
    {
      label: "Processing", value: processing.length, sub: "running matches",
      gradient: "linear-gradient(135deg, #d97706, #f59e0b)",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    },
    {
      label: "Active Buyers", value: activeB.length, sub: "registered buyers",
      gradient: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
  ];

  return (
    <AdminLayout>
      <div style={{ maxWidth: "960px" }} className="animate-in">

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <p style={{ fontSize: "0.78rem", color: "var(--text-4)", margin: "0 0 4px", letterSpacing: "0.02em" }}>{greeting()},</p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 6px", lineHeight: 1.1 }}>
            {name}
          </h1>
          <p style={{ fontSize: "0.83rem", color: "var(--text-3)", margin: 0 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* KPI cards */}
        <div className="stat-grid">
          {stats.map(({ label, value, sub, gradient, icon }) => (
            <div key={label} className="stat-card">
              <div style={{ marginBottom: "18px" }}>
                <div style={{
                  width: "42px", height: "42px", borderRadius: "12px",
                  background: gradient,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-1)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.22)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}>{icon}</div>
              </div>
              <p style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px", letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</p>
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
        <div className="two-col-layout">

          {/* Recent rounds */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h2 style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)", margin: 0, letterSpacing: "-0.01em" }}>Recent Rounds</h2>
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
                          background: "var(--surface)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--text-3)",
                        }}>{COMMODITY_ICON[r.commodity] || COMMODITY_ICON.other}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, color: "var(--text-1)", margin: "0 0 2px", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                          <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: 0 }}>
                            {r.total_line_items.toLocaleString()} items
                            {r.submission_deadline && ` · Due ${fmtDatetimeShort(r.submission_deadline)}`}
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
                      <span style={{ fontSize: "0.75rem", color: "var(--text-1)", fontWeight: 600 }}>{cnt}</span>
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
