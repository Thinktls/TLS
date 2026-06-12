"use client";
import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Round {
  id: number; name: string; commodity: string; status: string;
  total_line_items: number; master_file_uploaded: boolean; submission_deadline: string | null;
}

const COMMODITY_ICON: Record<string, React.ReactNode> = {
  laptops:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  desktops:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  servers:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  networking: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>,
  storage:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>,
  peripherals:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  other:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
};

const BADGE_MAP: Record<string, string> = {
  draft: "badge-draft", open: "badge-open", closed: "badge-closed",
  processing: "badge-processing", complete: "badge-complete", error: "badge-error",
};

const STATUS_ORDER = ["open", "processing", "closed", "complete", "draft"];

export default function BidRoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await api.delete(`/rounds/${id}`);
      setRounds(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Could not delete round.");
    } finally {
      setDeleting(null);
      setConfirmId(null);
    }
  }

  useEffect(() => {
    api.get("/rounds/").then(r => setRounds(r.data)).finally(() => setLoading(false));
  }, []);

  const statuses = ["all", ...STATUS_ORDER.filter(s => rounds.some(r => r.status === s))];

  const searched = search.trim()
    ? rounds.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        String(r.id) === search.trim() ||
        r.commodity.toLowerCase().includes(search.toLowerCase())
      )
    : rounds;

  const filtered = filter === "all" ? searched : searched.filter(r => r.status === filter);
  const sorted   = [...filtered].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  const counts = {
    total:    rounds.length,
    open:     rounds.filter(r => r.status === "open").length,
    complete: rounds.filter(r => r.status === "complete").length,
  };

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div style={{ maxWidth: "880px" }} className="animate-in">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>Bid Rounds</h1>
            <p style={{ fontSize: "0.8rem", color: "var(--text-4)", margin: 0 }}>
              {counts.total} total &nbsp;·&nbsp;
              <span style={{ color: "#34d399" }}>{counts.open} open</span> &nbsp;·&nbsp;
              <span style={{ color: "#a78bfa" }}>{counts.complete} complete</span>
            </p>
          </div>
          <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Round
          </Link>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: "16px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, or commodity..."
            className="glass-input"
            style={{ width: "100%", paddingLeft: "36px", paddingRight: search ? "36px" : "12px", boxSizing: "border-box" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: "4px", display: "flex" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Filter tabs */}
        {rounds.length > 0 && (
          <div style={{ display: "flex", gap: "4px", marginBottom: "20px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px" }}>
            {statuses.map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: "6px 14px", borderRadius: "7px", fontSize: "0.78rem", cursor: "pointer", border: "none",
                background: filter === s ? "var(--brand)" : "transparent",
                color: filter === s ? "#ffffff" : "var(--text-4)",
                fontWeight: filter === s ? 600 : 400,
                transition: "all 0.15s", fontFamily: "inherit",
              }}>
                {s === "all" ? `All (${rounds.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${rounds.filter(r => r.status === s).length})`}
              </button>
            ))}
          </div>
        )}

        {/* Search no results */}
        {search && sorted.length === 0 && rounds.length > 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-4)" }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-3)", margin: "0 0 4px" }}>No rounds match "{search}"</p>
            <p style={{ fontSize: "0.8rem", margin: 0 }}>Try searching by round name, ID number, or commodity type.</p>
          </div>
        )}

        {sorted.length === 0 && !search ? (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "72px", textAlign: "center" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-4)", margin: "0 auto 16px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>
              {filter === "all" ? "No bid rounds yet" : `No ${filter} rounds`}
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: "0 0 20px" }}>Create your first round to start collecting bids.</p>
            <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none" }}>Create First Round</Link>
          </div>
        ) : sorted.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sorted.map((r, i) => (
              <div key={r.id} style={{ position: "relative" }} className="animate-in">
                <Link href={`/admin/rounds/${r.id}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
                    padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px",
                    transition: "all 0.15s", animationDelay: `${i * 30}ms`,
                  }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(61,129,227,0.25)"; el.style.background = "var(--bg-3)"; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.background = "var(--bg-2)"; }}
                  >
                    {/* Commodity icon */}
                    <div style={{
                      width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--text-3)",
                    }}>{COMMODITY_ICON[r.commodity] || COMMODITY_ICON.other}</div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                        <p style={{ fontWeight: 700, color: "var(--text-1)", margin: 0, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                        {!r.master_file_uploaded && (
                          <span style={{ fontSize: "0.67rem", color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", padding: "1px 7px", borderRadius: "100px", flexShrink: 0 }}>No master file</span>
                        )}
                      </div>
                      <p style={{ fontSize: "0.73rem", color: "var(--text-4)", margin: 0 }}>
                        <span style={{ textTransform: "capitalize" }}>{r.commodity}</span>
                        {" · "}
                        <span>{r.total_line_items.toLocaleString()} items</span>
                        {r.submission_deadline && (
                          <span> · Due {new Date(r.submission_deadline).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })} EST</span>
                        )}
                      </p>
                    </div>

                    {/* Right side — ID + badge + chevron (leave room for delete button) */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginRight: "44px" }}>
                      <span style={{
                        fontSize: "0.7rem", color: "var(--brand)", fontWeight: 700, fontFamily: "monospace",
                        background: "rgba(61,129,227,0.1)", border: "1px solid rgba(61,129,227,0.2)",
                        padding: "2px 8px", borderRadius: "5px",
                      }}>#{r.id}</span>
                      <span className={`badge ${BADGE_MAP[r.status] || "badge-draft"}`}>{r.status}</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-4)", flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>
                </Link>

                {/* Delete / Confirm — always visible, separate from the link */}
                <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", zIndex: 2 }}>
                  {confirmId === r.id ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      background: "var(--bg-1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: "8px", padding: "4px 8px",
                    }}>
                      <span style={{ fontSize: "0.71rem", color: "var(--text-3)", whiteSpace: "nowrap", marginRight: "2px" }}>Delete?</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                        disabled={deleting === r.id}
                        style={{ fontSize: "0.71rem", fontWeight: 700, color: "#fff", background: "#ef4444", border: "none", borderRadius: "5px", padding: "3px 10px", cursor: "pointer" }}
                      >{deleting === r.id ? "…" : "Yes"}</button>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmId(null); }}
                        style={{ fontSize: "0.71rem", color: "var(--text-4)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "5px", padding: "3px 8px", cursor: "pointer" }}
                      >No</button>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); if (r.status !== "open" && r.status !== "processing") setConfirmId(r.id); }}
                      title={r.status === "open" || r.status === "processing" ? "Cannot delete an active round" : "Delete round"}
                      disabled={r.status === "open" || r.status === "processing"}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "30px", height: "30px", borderRadius: "7px",
                        background: r.status === "open" || r.status === "processing" ? "transparent" : "rgba(239,68,68,0.1)",
                        border: r.status === "open" || r.status === "processing" ? "1px solid transparent" : "1px solid rgba(239,68,68,0.25)",
                        color: r.status === "open" || r.status === "processing" ? "var(--text-4)" : "#f87171",
                        cursor: r.status === "open" || r.status === "processing" ? "not-allowed" : "pointer",
                        opacity: r.status === "open" || r.status === "processing" ? 0.35 : 1,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (r.status !== "open" && r.status !== "processing") { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(239,68,68,0.18)"; el.style.borderColor = "rgba(239,68,68,0.4)"; } }}
                      onMouseLeave={e => { if (r.status !== "open" && r.status !== "processing") { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(239,68,68,0.1)"; el.style.borderColor = "rgba(239,68,68,0.25)"; } }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
