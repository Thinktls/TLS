"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";
import { fmtDate } from "@/lib/format";

interface BuyerProfile {
  id: number;
  full_name: string;
  email: string;
  company_name: string;
  is_active: boolean;
  fluff_percentage: number;
  fluff_enabled: boolean;
  win_rate: number;
  total_lines_won: number;
  total_lines_bid: number;
  total_margin_contribution: number;
  buyer_score: number;
  last_bid_at: string | null;
  last_win_date: string | null;
  score_updated_at: string | null;
  total_deal_value: number;
  total_deals_won: number;
}

const stat = (label: string, value: string | number, color = "var(--text-1)"): [string, string | number, string] =>
  [label, value, color];

function fmt(dt: string | null): string {
  return fmtDate(dt) === "—" ? "Never" : fmtDate(dt);
}

export default function BuyerProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 3500);
  }

  async function load() {
    const res = await api.get(`/auth/buyers/${id}/profile`).catch(() => null);
    if (res) setProfile(res.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function toggleActive() {
    await api.patch(`/auth/buyers/${id}/toggle`);
    flash("✓ Status updated");
    load();
  }

  async function sendInvite() {
    try {
      await api.post(`/auth/buyers/${id}/send-invite`);
      flash("✓ Invite email sent");
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to send invite", "err");
    }
  }

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (!profile) return (
    <AdminLayout>
      <div style={{ color: "var(--danger)", paddingTop: "60px", textAlign: "center" }}>Buyer not found.</div>
    </AdminLayout>
  );

  const stats: [string, string | number, string][] = [
    stat("Win Rate",         `${profile.win_rate.toFixed(1)}%`,  profile.win_rate > 50 ? "var(--success)" : profile.win_rate > 25 ? "var(--warning)" : "var(--danger)"),
    stat("Lines Won",        profile.total_lines_won,            "var(--success)"),
    stat("Lines Bid",        profile.total_lines_bid,            "var(--text-1)"),
    stat("Deals Awarded",    profile.total_deals_won,            "var(--violet-bright)"),
    stat("Margin Contrib.",  `$${profile.total_margin_contribution.toLocaleString()}`, "var(--info)"),
    stat("Deal Value Won",   `$${profile.total_deal_value.toLocaleString()}`, "var(--text-1)"),
  ];

  return (
    <AdminLayout>
      <div style={{ maxWidth: "820px" }} className="animate-in">
        <Link href="/admin/buyers" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Buyers
        </Link>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>
              {profile.full_name}
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
              {profile.company_name || profile.email}
            </p>
            <span style={{
              display: "inline-block",
              marginTop: "8px",
              padding: "3px 12px",
              borderRadius: "100px",
              fontSize: "0.72rem",
              fontWeight: 600,
              background: profile.is_active ? "var(--success-dim)" : "var(--danger-dim)",
              color: profile.is_active ? "var(--success)" : "var(--danger)",
            }}>
              {profile.is_active ? "Active" : "Disabled"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={sendInvite} className="btn-brand" style={{ fontSize: "0.8rem" }}>
              Resend Invite
            </button>
            <button onClick={toggleActive} className="btn-ghost" style={{ fontSize: "0.8rem" }}>
              {profile.is_active ? "Disable" : "Enable"} Account
            </button>
          </div>
        </div>

        {msg && (
          <div style={{
            marginBottom: "16px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "var(--success-dim)" : "var(--danger-dim)",
            border: `1px solid ${msgType === "ok" ? "var(--success-dim)" : "var(--danger-dim)"}`,
            color: msgType === "ok" ? "var(--success)" : "var(--danger)",
          }}>{msg}</div>
        )}

        {/* Score + Fluff info */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px",
        }}>
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            padding: "20px",
          }}>
            <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Buyer Score
            </p>
            <p style={{ fontSize: "2.4rem", fontWeight: 700, color: "var(--violet-bright)", margin: 0 }}>
              {profile.buyer_score.toFixed(0)}
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: "6px 0 0" }}>
              Updated {fmt(profile.score_updated_at)}
            </p>
          </div>
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            padding: "20px",
          }}>
            <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Fluff %
            </p>
            <p style={{ fontSize: "2.4rem", fontWeight: 700, color: "var(--warning)", margin: 0 }}>
              {profile.fluff_percentage}%
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: "6px 0 0" }}>
              {profile.fluff_enabled ? "Enabled" : "Disabled"} · Applied to loss notices
            </p>
          </div>
        </div>

        {/* Performance stats grid */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
          marginBottom: "16px",
        }}>
          <p style={{ fontWeight: 600, color: "var(--text-1)", margin: "0 0 16px", fontSize: "0.9rem" }}>Performance</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {stats.map(([label, value, color]) => (
              <div key={label} style={{
                padding: "14px",
                background: "var(--surface)",
                borderRadius: "10px",
                border: "1px solid var(--border)",
              }}>
                <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                <p style={{ fontSize: "1.3rem", fontWeight: 700, color, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Activity timeline */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
        }}>
          <p style={{ fontWeight: 600, color: "var(--text-1)", margin: "0 0 16px", fontSize: "0.9rem" }}>Activity</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              ["Last Bid", fmt(profile.last_bid_at)],
              ["Last Win", fmt(profile.last_win_date)],
              ["Email", profile.email],
              ["Company", profile.company_name || "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.83rem" }}>
                <span style={{ color: "var(--text-3)" }}>{label}</span>
                <span style={{ color: "var(--text-1)" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
