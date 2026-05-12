"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Deal {
  id: number;
  part_number: string;
  description: string;
  quantity: number;
  winning_price: number;
  total_value: number;
  status: string;
  razor_push_status: string;
  razor_deal_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  winner_company: string;
  winner_email: string;
  winning_buyer_id: number;
  override_count: number;
  notes: string | null;
}

interface Buyer { id: number; full_name: string; company_name: string; email: string; }

interface OverrideModal {
  dealId: number;
  partNumber: string;
  field: "" | "unit_price" | "quantity" | "winning_buyer";
  newValue: string;
  reason: string;
}

const statusBadge: Record<string, { background: string; color: string }> = {
  pending_approval: { background: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  approved:         { background: "rgba(52,211,153,0.15)",  color: "#34d399" },
  rejected:         { background: "rgba(239,68,68,0.15)",   color: "#f87171" },
  pushed_to_razor:  { background: "rgba(61,129,227,0.15)",  color: "#60a5fa" },
};

const EMPTY_MODAL: OverrideModal = { dealId: 0, partNumber: "", field: "", newValue: "", reason: "" };

export default function DealsPage() {
  const { id } = useParams();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [override, setOverride] = useState<OverrideModal | null>(null);
  const [submittingOverride, setSubmittingOverride] = useState(false);

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  }

  async function load() {
    const [d, b] = await Promise.all([
      api.get(`/deals/rounds/${id}`).then((r) => r.data).catch(() => []),
      api.get("/auth/buyers").then((r) => r.data).catch(() => []),
    ]);
    setDeals(d);
    setBuyers(b);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function singleAction(dealId: number, endpoint: string, label: string) {
    setActing(dealId);
    try {
      await api.post(`/deals/${dealId}/${endpoint}`);
      flash(`✓ Deal ${label}`);
      load();
    } catch (err: any) {
      flash(err.response?.data?.detail || `Failed to ${label}`, "err");
    } finally {
      setActing(null);
    }
  }

  async function approveAll() {
    setApprovingAll(true);
    try {
      const res = await api.post(`/deals/rounds/${id}/approve-all`);
      flash(`✓ ${res.data.approved} deal(s) approved`);
      load();
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed", "err");
    } finally {
      setApprovingAll(false);
    }
  }

  async function submitOverride() {
    if (!override) return;
    if (!override.field) { flash("Select a field to override", "err"); return; }
    if (!override.newValue.trim()) { flash("Enter a new value", "err"); return; }
    if (!override.reason.trim()) { flash("Reason note is required for overrides", "err"); return; }
    setSubmittingOverride(true);
    try {
      await api.post(`/deals/${override.dealId}/override`, {
        field_changed: override.field,
        new_value: override.newValue,
        reason_note: override.reason,
      });
      flash(`✓ Override saved for ${override.partNumber}`);
      setOverride(null);
      load();
    } catch (err: any) {
      flash(err.response?.data?.detail || "Override failed", "err");
    } finally {
      setSubmittingOverride(false);
    }
  }

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  const pendingCount = deals.filter((d) => d.status === "pending_approval").length;
  const totalValue = deals.filter((d) => d.status !== "rejected").reduce((s, d) => s + d.total_value, 0);

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1100px" }}>
        <Link href={`/admin/rounds/${id}`} style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Round Detail
        </Link>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", margin: "10px 0 24px" }}>
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: 0 }}>
              Deal Approval
            </h2>
            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
              {deals.length} deals · ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} total
            </p>
          </div>
          {pendingCount > 0 && (
            <button onClick={approveAll} disabled={approvingAll} className="btn-brand" style={{ background: "#059669" }}>
              {approvingAll ? "Approving..." : `Approve All (${pendingCount})`}
            </button>
          )}
        </div>

        {msg && (
          <div style={{
            marginBottom: "16px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: msgType === "ok" ? "#34d399" : "#f87171",
          }}>
            {msg}
          </div>
        )}

        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          overflow: "hidden",
        }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Part Number</th>
                <th>Description</th>
                <th>Winner</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const badge = statusBadge[d.status] || statusBadge.pending_approval;
                return (
                  <tr key={d.id}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{d.part_number}</td>
                    <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.description}
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>
                      <div style={{ fontWeight: 500, color: "white" }}>{d.winner_company || "—"}</div>
                      <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)" }}>{d.winner_email}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>{d.quantity}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>${d.winning_price.toFixed(2)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "white" }}>
                      ${d.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                        <span style={{
                          ...badge,
                          padding: "3px 10px", borderRadius: "100px",
                          fontSize: "0.7rem", fontWeight: 600, whiteSpace: "nowrap",
                        }}>
                          {d.status.replace(/_/g, " ")}
                        </span>
                        {d.override_count > 0 && (
                          <span style={{ fontSize: "0.65rem", color: "#fbbf24" }}>
                            {d.override_count} override{d.override_count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "5px", justifyContent: "center", flexWrap: "wrap" }}>
                        {d.status === "pending_approval" && (
                          <>
                            <ActionBtn
                              label="Approve"
                              bg="rgba(52,211,153,0.15)" color="#34d399" border="rgba(52,211,153,0.2)"
                              disabled={acting === d.id}
                              onClick={() => singleAction(d.id, "approve", "approved")}
                            />
                            <ActionBtn
                              label="Reject"
                              bg="rgba(239,68,68,0.12)" color="#f87171" border="rgba(239,68,68,0.2)"
                              disabled={acting === d.id}
                              onClick={() => singleAction(d.id, "reject", "rejected")}
                            />
                          </>
                        )}
                        <ActionBtn
                          label="Override"
                          bg="rgba(251,191,36,0.1)" color="#fbbf24" border="rgba(251,191,36,0.2)"
                          disabled={false}
                          onClick={() => setOverride({ dealId: d.id, partNumber: d.part_number, field: "", newValue: "", reason: "" })}
                        />
                        {d.status === "approved" && (
                          <ActionBtn
                            label="→ Razor"
                            bg="rgba(61,129,227,0.15)" color="#60a5fa" border="rgba(61,129,227,0.2)"
                            disabled={acting === d.id}
                            onClick={() => singleAction(d.id, "push-razor", "pushed to Razor")}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Override Modal */}
        {override && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              background: "#0d1826",
              border: "1px solid rgba(61,129,227,0.3)",
              borderRadius: "20px",
              padding: "32px",
              width: "100%",
              maxWidth: "480px",
            }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "white", margin: "0 0 6px" }}>
                Override Deal
              </h3>
              <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", margin: "0 0 24px" }}>
                {override.partNumber} · All overrides are logged with your account.
              </p>

              <label style={labelStyle}>Field to Override</label>
              <select
                value={override.field}
                onChange={(e) => setOverride({ ...override, field: e.target.value as OverrideModal["field"] })}
                className="glass-input"
                style={{ marginBottom: 14 }}
              >
                <option value="">Select field...</option>
                <option value="unit_price">Unit Price</option>
                <option value="quantity">Quantity</option>
                <option value="winning_buyer">Winning Buyer ID</option>
              </select>

              <label style={labelStyle}>New Value</label>
              <input
                type="text"
                value={override.newValue}
                onChange={(e) => setOverride({ ...override, newValue: e.target.value })}
                placeholder={override.field === "unit_price" ? "e.g. 1250.00" : override.field === "quantity" ? "e.g. 5" : "Buyer ID"}
                className="glass-input"
                style={{ marginBottom: 14 }}
              />

              <label style={labelStyle}>Reason Note (required)</label>
              <textarea
                value={override.reason}
                onChange={(e) => setOverride({ ...override, reason: e.target.value })}
                placeholder="Explain why this override is necessary..."
                rows={3}
                className="glass-input"
                style={{ marginBottom: 20, resize: "vertical" }}
              />

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={submitOverride} disabled={submittingOverride} className="btn-brand">
                  {submittingOverride ? "Saving..." : "Save Override"}
                </button>
                <button onClick={() => setOverride(null)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 500,
  color: "rgba(255,255,255,0.5)",
  marginBottom: "6px",
};

function ActionBtn({ label, bg, color, border, disabled, onClick }: {
  label: string; bg: string; color: string; border: string;
  disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "3px 10px",
        background: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: "6px",
        fontSize: "0.72rem",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
