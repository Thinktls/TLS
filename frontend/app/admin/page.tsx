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
  draft:      { label: "Draft",      dot: "var(--text-4)", badge: "badge-draft" },
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

function StatCard({
  label, value, sub, gradient, icon,
}: { label: string; value: number; sub: string; gradient: string; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      <div style={{ marginBottom: "18px" }}>
        <div style={{
          width: "42px", height: "42px", borderRadius: "12px",
          background: gradient,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-on-brand)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.22)",
          border: "1px solid var(--border-mid)",
        }}>{icon}</div>
      </div>
      <p style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px", letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-3)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: "0.7rem", color: "var(--text-4)", margin: 0 }}>{sub}</p>
    </div>
  );
}

function RoundRow({ round }: { round: Round }) {
  const meta = STATUS_META[round.status] || STATUS_META.draft;
  return (
    <Link href={`/admin/rounds/${round.id}`} className="dash-round-row">
      <div className="dash-commodity-icon">{COMMODITY_ICON[round.commodity] || COMMODITY_ICON.other}</div>
      <div className="dash-round-info">
        <p className="dash-round-name">{round.name}</p>
        <p className="dash-round-sub">
          {round.total_line_items.toLocaleString()} items
          {round.submission_deadline && ` · Due ${fmtDatetimeShort(round.submission_deadline)}`}
        </p>
      </div>
      <span className={`badge ${meta.badge}`}>{round.status}</span>
    </Link>
  );
}

function StatusRow({
  label, dot, count, total,
}: { label: string; dot: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="dash-status-row">
      <div className="dash-status-head">
        <div className="dash-status-label"><span className="dash-dot" style={{ background: dot }} />{label}</div>
        <span className="dash-status-count">{count}</span>
      </div>
      <div className="dash-progress"><div className="dash-progress-fill" style={{ width: `${pct}%`, background: dot }} /></div>
    </div>
  );
}

function QuickLink({ label, href, icon }: { label: string; href: string; icon: string }) {
  return (
    <Link href={href} className="dash-quick-link">
      <span className="dash-quick-icon">{icon}</span>
      <span className="dash-quick-label">{label}</span>
      <svg className="dash-quick-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
    </Link>
  );
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
      <div className="dash-wrap animate-in">
        <div className="dash-header">
          <div className="skeleton skeleton-text" style={{ width: "80px", marginBottom: "8px" }} />
          <div className="skeleton skeleton-title" style={{ width: "200px", height: "1.6rem", marginBottom: "8px" }} />
          <div className="skeleton skeleton-text" style={{ width: "140px" }} />
        </div>
        <div className="stat-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton skeleton-circle" style={{ width: "42px", height: "42px", marginBottom: "18px" }} />
              <div className="skeleton" style={{ width: "60px", height: "2rem", marginBottom: "8px" }} />
              <div className="skeleton skeleton-text" style={{ width: "80px", marginBottom: "4px" }} />
              <div className="skeleton skeleton-text" style={{ width: "50px" }} />
            </div>
          ))}
        </div>
        <div className="dash-panel">
          <div className="skeleton skeleton-title" style={{ width: "120px", marginBottom: "16px" }} />
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton skeleton-row" style={{ marginBottom: i < 6 ? "4px" : 0 }} />
          ))}
        </div>
      </div>
    </AdminLayout>
  );

  const openRounds     = rounds.filter(r => r.status === "open");
  const completeRounds = rounds.filter(r => r.status === "complete");
  const processing     = rounds.filter(r => r.status === "processing");
  const activeB        = buyers.filter(b => b.is_active);
  const recent         = rounds.slice(0, 6);

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

  const quickLinks = [
    { label: "Bid Comparison", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/comparison` : "/admin/rounds", icon: "📊" },
    { label: "Approve Deals", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/deals` : "/admin/rounds", icon: "✅" },
    { label: "Buyer Scoring", href: "/admin/buyers/compare", icon: "🏆" },
    { label: "Export Center", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/export` : "/admin/rounds", icon: "📥" },
  ];

  return (
    <AdminLayout>
      <div className="dash-wrap animate-in">

        {/* Header */}
        <div className="dash-header">
          <p className="dash-greeting">{greeting()},</p>
          <h1 className="dash-title">{name}</h1>
          <p className="dash-date">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>

        {/* KPI cards */}
        <div className="stat-grid">
          {stats.map(s => <StatCard key={s.label} {...s} />)}
        </div>

        {/* Quick actions */}
        <div className="dash-actions">
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
          <div className="dash-col-main">
            <div className="dash-section-head">
              <h2 className="dash-section-title">Recent Rounds</h2>
              <Link href="/admin/rounds" className="dash-view-all">
                View all <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="dash-empty">
                <p className="dash-empty-text">No rounds yet</p>
                <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none", fontSize: "0.82rem" }}>Create first round →</Link>
              </div>
            ) : (
              <div className="dash-rounds">
                {recent.map(r => <RoundRow key={r.id} round={r} />)}
              </div>
            )}
          </div>

          {/* Right column — summary */}
          <div className="dash-col-side">
            <div className="dash-panel">
              <p className="dash-panel-label">Round Status</p>
              {Object.entries(STATUS_META).map(([key, { label, dot }]) => (
                <StatusRow key={key} label={label} dot={dot} count={rounds.filter(r => r.status === key).length} total={rounds.length} />
              ))}
            </div>

            <div className="dash-panel">
              <p className="dash-panel-label">Quick Links</p>
              {quickLinks.map(q => <QuickLink key={q.label} {...q} />)}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}