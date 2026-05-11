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

const statusStyle: Record<string, { background: string; color: string }> = {
  draft:      { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" },
  open:       { background: "rgba(52,211,153,0.15)",  color: "#34d399" },
  closed:     { background: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  processing: { background: "rgba(61,129,227,0.15)",  color: "#60a5fa" },
  complete:   { background: "rgba(167,139,250,0.15)", color: "#a78bfa" },
};

export default function BidRoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/rounds/").then((r) => setRounds(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  const counts = {
    total: rounds.length,
    open: rounds.filter((r) => r.status === "open").length,
    complete: rounds.filter((r) => r.status === "complete").length,
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: 0 }}>Bid Rounds</h2>
          <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            {counts.total} total · {counts.open} open · {counts.complete} complete
          </p>
        </div>
        <Link href="/admin/rounds/new" className="btn-brand" style={{ textDecoration: "none" }}>
          + New Round
        </Link>
      </div>

      {rounds.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "80px", color: "rgba(255,255,255,0.3)" }}>
          <p style={{ fontSize: "0.95rem" }}>No bid rounds yet.</p>
          <p style={{ fontSize: "0.83rem", marginTop: "6px" }}>Create your first round to get started.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {rounds.map((r) => {
            const s = statusStyle[r.status] || statusStyle.draft;
            return (
              <Link key={r.id} href={`/admin/rounds/${r.id}`} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "14px",
                    padding: "18px 22px",
                    transition: "all 0.15s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "10px",
                        background: "rgba(255,255,255,0.06)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.78rem", fontWeight: 700, color: "rgba(255,255,255,0.5)",
                        flexShrink: 0,
                      }}>
                        #{r.id}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, color: "white", margin: 0, fontSize: "0.92rem" }}>{r.name}</p>
                        <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", margin: "3px 0 0" }}>
                          {r.commodity} &bull; {r.total_line_items.toLocaleString()} line items
                          {r.submission_deadline && ` · Deadline ${new Date(r.submission_deadline).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {!r.master_file_uploaded && (
                        <span style={{ fontSize: "0.72rem", color: "#fbbf24" }}>⚠ No master file</span>
                      )}
                      <span style={{
                        ...s,
                        padding: "4px 12px",
                        borderRadius: "100px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
