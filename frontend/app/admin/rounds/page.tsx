"use client";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Round {
  id: number; name: string; commodity: string; status: string;
  total_line_items: number; master_file_uploaded: boolean; submission_deadline: string | null;
}

const COMMODITY_ICON: Record<string, string> = {
  laptops: "💻", desktops: "🖥", servers: "🖧", networking: "🌐",
  storage: "💾", peripherals: "🖱", other: "📦",
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

  useEffect(() => {
    api.get("/rounds/").then(r => setRounds(r.data)).finally(() => setLoading(false));
  }, []);

  const statuses = ["all", ...STATUS_ORDER.filter(s => rounds.some(r => r.status === s))];
  const filtered = filter === "all" ? rounds : rounds.filter(r => r.status === filter);
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "white", letterSpacing: "-0.04em", margin: "0 0 4px" }}>Bid Rounds</h1>
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

        {/* Filter tabs */}
        {rounds.length > 0 && (
          <div style={{ display: "flex", gap: "4px", marginBottom: "20px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px" }}>
            {statuses.map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: "6px 14px", borderRadius: "7px", fontSize: "0.78rem", cursor: "pointer", border: "none",
                background: filter === s ? "rgba(61,129,227,0.2)" : "transparent",
                color: filter === s ? "white" : "var(--text-4)",
                fontWeight: filter === s ? 600 : 400,
                transition: "all 0.15s", fontFamily: "inherit",
              }}>
                {s === "all" ? `All (${rounds.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${rounds.filter(r => r.status === s).length})`}
              </button>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "72px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>🗂</div>
            <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>
              {filter === "all" ? "No bid rounds yet" : `No ${filter} rounds`}
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: "0 0 20px" }}>Create your first round to start collecting bids.</p>
            <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none" }}>Create First Round</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sorted.map((r, i) => (
              <Link key={r.id} href={`/admin/rounds/${r.id}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
                  padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px",
                  transition: "all 0.15s", animationDelay: `${i * 30}ms`,
                }}
                  className="animate-in"
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(61,129,227,0.25)"; el.style.background = "var(--bg-3)"; el.style.transform = "translateX(2px)"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.background = "var(--bg-2)"; el.style.transform = "translateX(0)"; }}
                >
                  {/* Commodity icon */}
                  <div style={{
                    width: "42px", height: "42px", borderRadius: "11px", flexShrink: 0,
                    background: "rgba(61,129,227,0.08)", border: "1px solid rgba(61,129,227,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem",
                  }}>{COMMODITY_ICON[r.commodity] || "📦"}</div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <p style={{ fontWeight: 700, color: "white", margin: 0, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                      {!r.master_file_uploaded && (
                        <span style={{ fontSize: "0.67rem", color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", padding: "1px 7px", borderRadius: "100px", flexShrink: 0 }}>No master file</span>
                      )}
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-4)", margin: 0 }}>
                      <span style={{ textTransform: "capitalize" }}>{r.commodity}</span>
                      {" · "}
                      <span>{r.total_line_items.toLocaleString()} items</span>
                      {r.submission_deadline && (
                        <span> · Due {new Date(r.submission_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      )}
                    </p>
                  </div>

                  {/* Right side */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.68rem", color: "var(--text-4)", fontFamily: "monospace" }}>#{r.id}</span>
                    <span className={`badge ${BADGE_MAP[r.status] || "badge-draft"}`}>{r.status}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-4)", flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
