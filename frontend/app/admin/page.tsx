"use client";
import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";
import { getFullName } from "@/lib/auth";
import { fmtDatetimeShort } from "@/lib/format";
import { Icon, type IconName } from "@/components/icons";

interface Round {
  id: number; name: string; commodity: string; status: string;
  total_line_items: number; master_file_uploaded: boolean; submission_deadline: string | null;
}
interface Buyer { id: number; is_active: boolean; }

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  draft:      { label: "Draft",      dot: "var(--text-4)", badge: "badge-draft" },
  open:       { label: "Open",       dot: "var(--success-strong)",              badge: "badge-open" },
  closed:     { label: "Closed",     dot: "var(--warning)",              badge: "badge-closed" },
  processing: { label: "Processing", dot: "var(--info)",              badge: "badge-processing" },
  complete:   { label: "Complete",   dot: "var(--violet-bright)",              badge: "badge-complete" },
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

function Metric({
  label, value, sub, accent, icon,
}: { label: string; value: number; sub: string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="dash-metric" style={{ "--metric-accent": accent } as React.CSSProperties}>
      <div className="dash-metric-top">
        <span className="dash-metric-icon">{icon}</span>
        <span className="dash-metric-label">{label}</span>
      </div>
      <p className="dash-metric-value">{value}</p>
      <p className="dash-metric-sub">{sub}</p>
    </div>
  );
}

function RoundTableRow({ round }: { round: Round }) {
  const meta = STATUS_META[round.status] || STATUS_META.draft;
  return (
    <tr onClick={() => { window.location.href = `/admin/rounds/${round.id}`; }} style={{ cursor: "pointer" }}>
      <td>
        <div className="dash-round-table-name">
          <div className="dash-commodity-icon">{COMMODITY_ICON[round.commodity] || COMMODITY_ICON.other}</div>
          <span style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.85rem" }}>{round.name}</span>
        </div>
      </td>
      <td style={{ color: "var(--text-3)" }}>{round.total_line_items.toLocaleString()}</td>
      <td style={{ color: "var(--text-3)" }}>{round.submission_deadline ? fmtDatetimeShort(round.submission_deadline) : "—"}</td>
      <td style={{ textAlign: "right" }}><span className={`badge ${meta.badge}`}>{round.status}</span></td>
    </tr>
  );
}

function StatusChip({
  label, dot, count,
}: { label: string; dot: string; count: number }) {
  return (
    <div className="dash-status-chip">
      <span className="dash-dot" style={{ background: dot }} />
      <span className="dash-status-chip-label">{label}</span>
      <span className="dash-status-chip-count">{count}</span>
    </div>
  );
}

function QuickLinkTile({ label, href, icon, accent }: { label: string; href: string; icon: IconName; accent: string }) {
  return (
    <Link href={href} className="dash-quicklink-tile" style={{ "--tile-accent": accent } as React.CSSProperties}>
      <span className="dash-quicklink-icon"><Icon name={icon} size="sm" strokeWidth={1.75} /></span>
      <span className="dash-quicklink-title">{label}</span>
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
        <div className="dash-topbar">
          <div>
            <div className="skeleton skeleton-text" style={{ width: "70px", marginBottom: "8px" }} />
            <div className="skeleton skeleton-title" style={{ width: "200px", height: "1.5rem", marginBottom: "6px" }} />
            <div className="skeleton skeleton-text" style={{ width: "140px" }} />
          </div>
        </div>
        <div className="dash-metric-strip">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="dash-metric">
              <div className="skeleton skeleton-circle" style={{ width: "26px", height: "26px", marginBottom: "12px" }} />
              <div className="skeleton" style={{ width: "60px", height: "1.7rem", marginBottom: "6px" }} />
              <div className="skeleton skeleton-text" style={{ width: "70px" }} />
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

  const stats: { label: string; value: number; sub: string; accent: string; icon: React.ReactNode }[] = [
    {
      label: "Total Rounds", value: rounds.length, sub: "all time",
      accent: "var(--brand)",
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      label: "Open Now", value: openRounds.length, sub: "accepting bids",
      accent: "var(--success)",
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    },
    {
      label: "Processing", value: processing.length, sub: "running matches",
      accent: "var(--warning)",
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    },
    {
      label: "Active Buyers", value: activeB.length, sub: "registered buyers",
      accent: "var(--violet-bright)",
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
  ];

  const quickLinks: { label: string; href: string; icon: IconName; accent: string }[] = [
    { label: "Bid Comparison", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/comparison` : "/admin/rounds", icon: "reports", accent: "var(--info)" },
    { label: "Approve Deals", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/deals` : "/admin/rounds", icon: "success", accent: "var(--success)" },
    { label: "Buyer Scoring", href: "/admin/buyers/compare", icon: "trophy", accent: "var(--warning)" },
    { label: "Export Center", href: completeRounds[0] ? `/admin/rounds/${completeRounds[0].id}/export` : "/admin/rounds", icon: "download", accent: "var(--brand)" },
  ];

  return (
    <AdminLayout>
      <div className="dash-wrap animate-in">

        {/* Top bar — title + toolbar */}
        <div className="dash-topbar">
          <div>
            <p className="dash-eyebrow">Dashboard</p>
            <h1 className="dash-title">{greeting()}, {name}</h1>
            <p className="dash-date">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
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
        </div>

        {/* KPI metric strip */}
        <div className="dash-metric-strip">
          {stats.map(s => <Metric key={s.label} {...s} />)}
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
              <div className="panel">
                <table className="dark-table">
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Items</th>
                      <th>Deadline</th>
                      <th style={{ textAlign: "right" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(r => <RoundTableRow key={r.id} round={r} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right column — summary */}
          <div className="dash-col-side">
            <div className="dash-panel">
              <p className="dash-panel-label">Round Status</p>
              <div className="dash-status-total">
                <span className="dash-status-total-num">{rounds.length}</span>
                <span className="dash-status-total-label">total round{rounds.length === 1 ? "" : "s"}</span>
              </div>
              <div className="dash-status-bar">
                {rounds.length === 0 ? (
                  <div className="dash-status-bar-empty" />
                ) : (
                  Object.entries(STATUS_META).map(([key, { dot }]) => {
                    const count = rounds.filter(r => r.status === key).length;
                    if (count === 0) return null;
                    return (
                      <div
                        key={key}
                        className="dash-status-bar-seg"
                        style={{ flexBasis: `${(count / rounds.length) * 100}%`, background: dot }}
                      />
                    );
                  })
                )}
              </div>
              <div className="dash-status-chips">
                {Object.entries(STATUS_META).map(([key, { label, dot }]) => (
                  <StatusChip key={key} label={label} dot={dot} count={rounds.filter(r => r.status === key).length} />
                ))}
              </div>
            </div>

            <div className="dash-panel">
              <p className="dash-panel-label">Quick Links</p>
              <div className="dash-quicklink-grid">
                {quickLinks.map(q => <QuickLinkTile key={q.label} {...q} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}