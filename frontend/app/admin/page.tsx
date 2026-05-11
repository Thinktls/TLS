"use client";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Round {
  id: number;
  name: string;
  commodity: string;
  status: string;
  total_line_items: number;
  master_file_uploaded: boolean;
  submission_deadline: string | null;
}

interface Buyer {
  id: number;
  is_active: boolean;
}

const statusStyle: Record<string, { background: string; color: string }> = {
  draft:      { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" },
  open:       { background: "rgba(52,211,153,0.15)",  color: "#34d399" },
  closed:     { background: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  processing: { background: "rgba(61,129,227,0.15)",  color: "#60a5fa" },
  complete:   { background: "rgba(167,139,250,0.15)", color: "#a78bfa" },
};

export default function AdminDashboard() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/rounds/").then((r) => setRounds(r.data)),
      api.get("/auth/buyers").then((r) => setBuyers(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  const stats = [
    { label: "Total Rounds",   value: rounds.length,                                          color: "white" },
    { label: "Open Rounds",    value: rounds.filter((r) => r.status === "open").length,       color: "#34d399" },
    { label: "In Processing",  value: rounds.filter((r) => r.status === "processing").length, color: "#60a5fa" },
    { label: "Active Buyers",  value: buyers.filter((b) => b.is_active).length,               color: "#a78bfa" },
  ];

  const recent = rounds.slice(0, 5);

  return (
    <AdminLayout>
      <div style={{ maxWidth: "900px" }}>
        {/* Title */}
        <div style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: 0 }}>
            Dashboard
          </h2>
          <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            Overview of ThinkTLS Bid Desk activity
          </p>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "32px" }}>
          {stats.map(({ label, value, color }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              padding: "20px",
            }}>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
              </p>
              <p style={{ fontSize: "2rem", fontWeight: 700, color, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "32px" }}>
          <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none" }}>
            + New Round
          </Link>
          <Link href="/admin/buyers" className="btn-ghost" style={{ textDecoration: "none" }}>
            Manage Buyers
          </Link>
          <Link href="/admin/query" className="btn-ghost" style={{ textDecoration: "none" }}>
            AI Query
          </Link>
        </div>

        {/* Recent rounds */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <p style={{ fontWeight: 600, color: "white", margin: 0, fontSize: "0.95rem" }}>Recent Rounds</p>
            <Link href="/admin/rounds" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
              View all →
            </Link>
          </div>

          {recent.length === 0 ? (
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed rgba(255,255,255,0.08)",
              borderRadius: "14px",
              padding: "40px",
              textAlign: "center",
              color: "rgba(255,255,255,0.3)",
              fontSize: "0.88rem",
            }}>
              No rounds yet. <Link href="/admin/rounds/new" style={{ color: "#3D81E3", textDecoration: "none" }}>Create your first round →</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recent.map((r) => {
                const s = statusStyle[r.status] || statusStyle.draft;
                return (
                  <Link key={r.id} href={`/admin/rounds/${r.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: "12px",
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
                    >
                      <div>
                        <p style={{ fontWeight: 500, color: "white", margin: 0, fontSize: "0.88rem" }}>{r.name}</p>
                        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", margin: "3px 0 0" }}>
                          {r.commodity} · {r.total_line_items.toLocaleString()} items
                        </p>
                      </div>
                      <span style={{
                        ...s,
                        padding: "3px 10px",
                        borderRadius: "100px",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}>
                        {r.status}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
