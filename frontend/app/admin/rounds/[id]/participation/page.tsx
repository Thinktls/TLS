"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface BuyerStatus {
  id: number;
  full_name: string;
  email: string;
  company_name: string;
  invite_status: string;
  invited_at: string | null;
  uploaded_at: string | null;
  lines_submitted: number;
  file_name: string | null;
}

interface Stats {
  total: number;
  sent: number;
  uploaded: number;
  pending_invite: number;
  no_response: number;
}

interface ParticipationData {
  buyers: BuyerStatus[];
  stats: Stats;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "Not Invited",  color: "var(--text-3)", bg: "var(--surface)" },
  sent:       { label: "Invited",      color: "var(--info)",               bg: "var(--info-dim)" },
  uploaded:   { label: "Uploaded",     color: "var(--success)",               bg: "var(--success-dim)" },
  processing: { label: "Processing",   color: "var(--warning)",               bg: "var(--warning-dim)" },
  ready:      { label: "Ready",        color: "var(--violet-bright)",               bg: "var(--violet-dim)" },
  error:      { label: "Error",        color: "var(--danger)",               bg: "var(--danger-dim)" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "16px 20px",
    }}>
      <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p style={{ fontSize: "1.6rem", fontWeight: 700, color, margin: 0 }}>{value}</p>
    </div>
  );
}

export default function ParticipationTracker() {
  const { id } = useParams();
  const [data, setData] = useState<ParticipationData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/rounds/${id}/participation`);
      setData(res.data);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load, autoRefresh]);

  if (!data) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  const { buyers, stats } = data;

  const noResponse = buyers.filter((b) => b.invite_status === "sent" && !b.uploaded_at);
  const uploaded = buyers.filter((b) => b.uploaded_at);
  const notInvited = buyers.filter((b) => b.invite_status === "pending");

  return (
    <AdminLayout>
      <div style={{ maxWidth: "900px" }} className="animate-in">
        <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Round Detail
        </Link>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>
              Buyer Participation
            </h1>
            <p style={{ fontSize: "0.8rem", color: "var(--text-4)", margin: 0 }}>
              Live status · refreshes every 30s · last updated {timeAgo(lastRefresh.toISOString())}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ fontSize: "0.78rem", color: "var(--text-3)", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ accentColor: "var(--brand)" }}
              />
              Auto-refresh
            </label>
            <button onClick={load} className="btn-ghost" style={{ fontSize: "0.78rem" }}>
              Refresh now
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "24px" }}>
          <StatBox label="Total Buyers" value={stats.total} color="var(--text-1)" />
          <StatBox label="Invited" value={stats.sent} color="var(--info)" />
          <StatBox label="Uploaded" value={stats.uploaded} color="var(--success)" />
          <StatBox label="No Response" value={stats.no_response} color="var(--danger)" />
        </div>

        {/* Progress bar */}
        <div style={{
          background: "var(--surface)",
          borderRadius: "100px",
          height: "6px",
          marginBottom: "28px",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${stats.total > 0 ? (stats.uploaded / stats.total) * 100 : 0}%`,
            background: "linear-gradient(90deg, var(--brand), var(--success))",
            borderRadius: "100px",
            transition: "width 0.6s ease",
          }} />
        </div>

        {/* Uploaded buyers */}
        {uploaded.length > 0 && (
          <section style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--success)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Submitted ({uploaded.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {uploaded.map((b) => <BuyerRow key={b.id} b={b} />)}
            </div>
          </section>
        )}

        {/* No response buyers */}
        {noResponse.length > 0 && (
          <section style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--warning)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Invited — No Response ({noResponse.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {noResponse.map((b) => <BuyerRow key={b.id} b={b} />)}
            </div>
          </section>
        )}

        {/* Not invited buyers */}
        {notInvited.length > 0 && (
          <section style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-4)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Not Yet Invited ({notInvited.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {notInvited.map((b) => <BuyerRow key={b.id} b={b} />)}
            </div>
          </section>
        )}

        {buyers.length === 0 && (
          <p style={{ fontSize: "0.83rem", color: "var(--text-4)", textAlign: "center", padding: "40px 0" }}>
            No buyers assigned to this round yet.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}

function BuyerRow({ b }: { b: BuyerStatus }) {
  const cfg = STATUS_CONFIG[b.invite_status] || STATUS_CONFIG.pending;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      flexWrap: "wrap",
      gap: "8px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px",
          background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontSize: "0.75rem", fontWeight: 700, color: cfg.color,
        }}>
          {b.full_name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {b.full_name}
          </p>
          <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {b.company_name || b.email}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "20px", flexShrink: 0 }}>
        {b.uploaded_at && (
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-3)" }}>uploaded</p>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--success)", fontWeight: 500 }}>
              {timeAgo(b.uploaded_at)}
            </p>
          </div>
        )}
        {b.lines_submitted > 0 && (
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-3)" }}>lines</p>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-1)", fontWeight: 500 }}>
              {b.lines_submitted.toLocaleString()}
            </p>
          </div>
        )}
        {b.invited_at && !b.uploaded_at && (
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-3)" }}>invited</p>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-3)" }}>
              {timeAgo(b.invited_at)}
            </p>
          </div>
        )}
        <span style={{
          padding: "3px 10px",
          borderRadius: "100px",
          fontSize: "0.7rem",
          fontWeight: 600,
          background: cfg.bg,
          color: cfg.color,
          whiteSpace: "nowrap",
        }}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}
