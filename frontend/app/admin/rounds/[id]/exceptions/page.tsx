"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Exception {
  id: number;
  raw_part_number: string;
  normalized_part_number: string;
  description: string;
  unit_price: number;
  exception_type: string;
  exception_notes: string;
  match_score: number;
  buyer_name: string;
  buyer_company: string;
  suggested_match: { id: number; part_number: string; description: string } | null;
  resolved: boolean;
}

export default function ExceptionsPage() {
  const { id } = useParams();
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);

  async function load() {
    const res = await api.get(`/exceptions/rounds/${id}`);
    setExceptions(res.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function resolve(lineId: number, action: string, newMasterId?: number) {
    setResolving(lineId);
    try {
      await api.patch(`/exceptions/${lineId}/resolve`, { action, new_master_item_id: newMasterId });
      load();
    } finally {
      setResolving(null);
    }
  }

  const unresolved = exceptions.filter((e) => !e.resolved);
  const resolved = exceptions.filter((e) => e.resolved);

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div style={{ maxWidth: "860px" }}>
        <Link href={`/admin/rounds/${id}`} style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Back to Round
        </Link>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "10px 0 8px" }}>
          Exception Queue
        </h2>

        <div style={{ display: "flex", gap: "20px", fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "24px" }}>
          <span>{unresolved.length} unresolved</span>
          <span>{resolved.length} resolved</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {unresolved.map((ex) => (
            <div key={ex.id} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(251,146,60,0.25)",
              borderRadius: "16px",
              padding: "22px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                <div>
                  <span style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: "6px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    background: "rgba(251,146,60,0.15)",
                    color: "#fb923c",
                    textTransform: "capitalize",
                    marginBottom: "8px",
                  }}>
                    {ex.exception_type?.replace(/_/g, " ")}
                  </span>
                  <p style={{ fontWeight: 600, color: "white", margin: "0 0 4px", fontSize: "0.95rem" }}>{ex.raw_part_number}</p>
                  <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", margin: 0 }}>{ex.description}</p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontWeight: 600, color: "white", margin: "0 0 4px", fontSize: "0.9rem" }}>
                    ${ex.unit_price?.toFixed(2)}
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)", margin: 0 }}>{ex.buyer_company}</p>
                </div>
              </div>

              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)", marginBottom: "16px" }}>{ex.exception_notes}</p>

              {ex.suggested_match && (
                <div style={{
                  background: "rgba(61,129,227,0.1)",
                  border: "1px solid rgba(61,129,227,0.2)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                  fontSize: "0.83rem",
                }}>
                  <p style={{ color: "#60a5fa", fontWeight: 600, margin: "0 0 4px" }}>
                    Suggested match (score: {ex.match_score?.toFixed(0)}%)
                  </p>
                  <p style={{ color: "rgba(147,197,253,0.8)", margin: 0 }}>
                    {ex.suggested_match.part_number} — {ex.suggested_match.description}
                  </p>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px" }}>
                {ex.suggested_match && (
                  <button
                    onClick={() => resolve(ex.id, "approve_match")}
                    disabled={resolving === ex.id}
                    className="btn-brand"
                    style={{ background: "#059669", padding: "7px 16px", fontSize: "0.82rem" }}
                  >
                    Approve Match
                  </button>
                )}
                <button
                  onClick={() => resolve(ex.id, "reject")}
                  disabled={resolving === ex.id}
                  className="btn-ghost"
                  style={{ padding: "7px 16px", fontSize: "0.82rem", color: "#f87171", borderColor: "rgba(239,68,68,0.25)" }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}

          {unresolved.length === 0 && (
            <div style={{
              textAlign: "center",
              padding: "60px 0",
              color: "rgba(255,255,255,0.3)",
              fontSize: "0.9rem",
            }}>
              All exceptions have been resolved.
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
