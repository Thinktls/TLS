"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

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

const stat = (label: string, value: string | number, color = "white"): [string, string | number, string] =>
  [label, value, color];

function fmt(dt: string | null): string {
  if (!dt) return "Never";
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  if (!profile) return (
    <AdminLayout>
      <div style={{ color: "#f87171", paddingTop: "60px", textAlign: "center" }}>Buyer not found.</div>
    </AdminLayout>
  );

  const stats: [string, string | number, string][] = [
    stat("Win Rate",         `${profile.win_rate.toFixed(1)}%`,  profile.win_rate > 50 ? "#34d399" : profile.win_rate > 25 ? "#fbbf24" : "#f87171"),
    stat("Lines Won",        profile.total_lines_won,            "#34d399"),
    stat("Lines Bid",        profile.total_lines_bid,            "white"),
    stat("Deals Awarded",    profile.total_deals_won,            "#a78bfa"),
    stat("Margin Contrib.",  `$${profile.total_margin_contribution.toLocaleString()}`, "#60a5fa"),
    stat("Deal Value Won",   `$${profile.total_deal_value.toLocaleString()}`, "white"),
  ];

  return (
    <AdminLayout>
      <div style={{ maxWidth: "820px" }}>
        <Link href="/admin/buyers" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Buyers
        </Link>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", margin: "12px 0 28px" }}>
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: 0 }}>
              {profile.full_name}
            </h2>
            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
              {profile.company_name || profile.email}
            </p>
            <span style={{
              display: "inline-block",
              marginTop: "8px",
              padding: "3px 12px",
              borderRadius: "100px",
              fontSize: "0.72rem",
              fontWeight: 600,
              background: profile.is_active ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.12)",
              color: profile.is_active ? "#34d399" : "#f87171",
            }}>
              {profile.is_active ? "Active" : "Disabled"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={toggleActive} className="btn-ghost" style={{ fontSize: "0.8rem" }}>
              {profile.is_active ? "Disable" : "Enable"} Account
            </button>
          </div>
        </div>

        {msg && (
          <div style={{
            marginBottom: "16px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: msgType === "ok" ? "#34d399" : "#f87171",
          }}>{msg}</div>
        )}

        {/* Score + Fluff info */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px",
        }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "14px",
            padding: "20px",
          }}>
            <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Buyer Score
            </p>
            <p style={{ fontSize: "2.4rem", fontWeight: 700, color: "#a78bfa", margin: 0 }}>
              {profile.buyer_score.toFixed(0)}
            </p>
            <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", margin: "6px 0 0" }}>
              Updated {fmt(profile.score_updated_at)}
            </p>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "14px",
            padding: "20px",
          }}>
            <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Fluff %
            </p>
            <p style={{ fontSize: "2.4rem", fontWeight: 700, color: "#fbbf24", margin: 0 }}>
              {profile.fluff_percentage}%
            </p>
            <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", margin: "6px 0 0" }}>
              {profile.fluff_enabled ? "Enabled" : "Disabled"} · Applied to loss notices
            </p>
          </div>
        </div>

        {/* Performance stats grid */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "16px",
        }}>
          <p style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.9rem" }}>Performance</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {stats.map(([label, value, color]) => (
              <div key={label} style={{
                padding: "14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.05)",
              }}>
                <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                <p style={{ fontSize: "1.3rem", fontWeight: 700, color, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Activity timeline */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "16px",
          padding: "24px",
        }}>
          <p style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.9rem" }}>Activity</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              ["Last Bid", fmt(profile.last_bid_at)],
              ["Last Win", fmt(profile.last_win_date)],
              ["Email", profile.email],
              ["Company", profile.company_name || "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.83rem" }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                <span style={{ color: "rgba(255,255,255,0.8)" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
