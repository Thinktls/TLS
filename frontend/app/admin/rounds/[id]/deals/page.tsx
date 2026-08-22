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
  master_item_id: number;
  override_count: number;
  notes: string | null;
}

interface BidEntry {
  bid_line_id: number;
  buyer_id: number;
  buyer_company: string | null;
  buyer_email: string | null;
  unit_price: number | null;
  quantity: number | null;
  is_winner: boolean;
  match_status: string;
  is_anomaly: boolean;
  fluffed_loss_price: number | null;
}

interface OverrideModal {
  dealId: number;
  partNumber: string;
  field: "" | "unit_price" | "quantity" | "winning_buyer";
  newValue: string;
  reason: string;
}

interface RoundBuyer {
  id: number;
  full_name: string;
  email: string;
  company_name: string | null;
}

interface AwardLotModal {
  buyerId: number | "";
  reason: string;
}

interface RollupBuyer { buyer_id: number; buyer: string; qty: number; avg_price: number | null; total_value: number; }
interface RollupRow {
  model: string; description: string; qty: number; total_value: number;
  avg_price: number | null; min_price: number | null; max_price: number | null;
  buyers: RollupBuyer[]; status: string;
}
interface RollupData {
  rollup: RollupRow[];
  total_models: number; total_devices: number; total_value: number;
}

const statusBadge: Record<string, { background: string; color: string }> = {
  pending_approval: { background: "var(--warning-dim)", color: "var(--warning)" },
  approved:         { background: "var(--success-dim)", color: "var(--success)" },
  rejected:         { background: "var(--danger-dim)",  color: "var(--danger)" },
  pushed_to_razor:  { background: "var(--brand-dim)", color: "var(--info)" },
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 500,
  color: "var(--text-3)",
  marginBottom: "6px",
};

function AllBidsPanel({ roundId, masterItemId }: { roundId: string; masterItemId: number }) {
  const [bids, setBids] = useState<BidEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/rounds/${roundId}/master-items/${masterItemId}/bids`)
      .then((r) => setBids(r.data))
      .catch(() => setBids([]))
      .finally(() => setLoading(false));
  }, [roundId, masterItemId]);

  if (loading) return (
    <td colSpan={8} style={{ padding: "12px 20px", background: "var(--surface)" }}>
      <span style={{ fontSize: "0.78rem", color: "var(--text-4)" }}>Loading bids...</span>
    </td>
  );

  if (!bids || bids.length === 0) return (
    <td colSpan={8} style={{ padding: "12px 20px", background: "var(--surface)" }}>
      <span style={{ fontSize: "0.78rem", color: "var(--text-4)" }}>No bid data available.</span>
    </td>
  );

  return (
    <td colSpan={8} style={{ padding: "0", background: "var(--surface)" }}>
      <div style={{ padding: "12px 24px 16px" }}>
        <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
          All Competing Bids ({bids.length})
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Buyer", "Unit Price", "Qty", "Status"].map((h) => (
                <th key={h} style={{
                  textAlign: h === "Unit Price" || h === "Qty" ? "right" : "left",
                  fontSize: "0.68rem", fontWeight: 600, color: "var(--text-4)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  paddingBottom: "6px", borderBottom: "1px solid var(--border)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bids.map((b) => (
              <tr key={b.bid_line_id} style={{ background: b.is_winner ? "var(--success-dim)" : "transparent" }}>
                <td style={{ padding: "6px 8px 6px 0", fontSize: "0.78rem" }}>
                  <span style={{ color: b.is_winner ? "var(--success)" : "var(--text-2)", fontWeight: b.is_winner ? 600 : 400 }}>
                    {b.is_winner ? "★ " : ""}{b.buyer_company || b.buyer_email || `Buyer ${b.buyer_id}`}
                  </span>
                  {b.is_anomaly && (
                    <span title="This bid was flagged as a possible price typo (far from the other bids). See the Exceptions page for the reason." style={{ marginLeft: "6px", fontSize: "0.65rem", color: "#c084fc", background: "rgba(168,85,247,0.15)", padding: "1px 6px", borderRadius: "4px", cursor: "help" }}>
                      anomaly
                    </span>
                  )}
                </td>
                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: "0.78rem", padding: "6px 8px", color: b.is_winner ? "var(--success)" : "var(--text-2)" }}>
                  {b.unit_price != null ? `$${b.unit_price.toFixed(2)}` : "—"}
                </td>
                <td style={{ textAlign: "right", fontSize: "0.78rem", padding: "6px 8px", color: "var(--text-3)" }}>
                  {b.quantity ?? "—"}
                </td>
                <td style={{ padding: "6px 0 6px 8px", fontSize: "0.72rem" }}>
                  {b.is_winner ? (
                    <span style={{ color: "var(--success)" }}>Winner</span>
                  ) : b.fluffed_loss_price != null ? (
                    <span style={{ color: "var(--text-4)" }}>
                      Lost · shown ${b.fluffed_loss_price.toFixed(2)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-4)" }}>{b.match_status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </td>
  );
}

export default function DealsPage() {
  const { id } = useParams();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [override, setOverride] = useState<OverrideModal | null>(null);
  const [submittingOverride, setSubmittingOverride] = useState(false);
  const [expandedDeal, setExpandedDeal] = useState<number | null>(null);
  const [awardLot, setAwardLot] = useState<AwardLotModal | null>(null);
  const [roundBuyers, setRoundBuyers] = useState<RoundBuyer[]>([]);
  const [awardingLot, setAwardingLot] = useState(false);
  const [viewMode, setViewMode] = useState<"device" | "model">("device");
  const [rollup, setRollup] = useState<RollupData | null>(null);
  const [rollupLoading, setRollupLoading] = useState(false);

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  }

  async function load() {
    const d = await api.get(`/deals/rounds/${id}`).then((r) => r.data).catch(() => []);
    setDeals(d);
    setLoading(false);
    // Refresh the model rollup too if it's been loaded, so both views stay in sync after actions.
    if (rollup) loadRollup();
  }

  async function loadRollup() {
    setRollupLoading(true);
    const r = await api.get(`/deals/rounds/${id}/rollup`).then((x) => x.data).catch(() => null);
    setRollup(r);
    setRollupLoading(false);
  }

  function switchView(mode: "device" | "model") {
    setViewMode(mode);
    if (mode === "model" && !rollup) loadRollup();
  }

  useEffect(() => {
    load();
    api.get(`/rounds/${id}/buyers`).then((r) => setRoundBuyers(r.data)).catch(() => {});
  }, [id]);

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
    // Approving emails every assigned buyer their win/loss result. That leaves the building
    // and cannot be recalled, so make the admin confirm rather than firing on a single click.
    const ok = window.confirm(
      `Approve ${pendingCount} deal(s) for this round?\n\n` +
      `This will:\n` +
      `  1. Lock in the winner and price on every pending deal\n` +
      `  2. EMAIL every assigned buyer their result — winners get what they won, ` +
      `outbid buyers get each item with their bid vs the winning price\n` +
      `  3. Recalculate buyer scores from these results\n` +
      `  4. Unlock the exports (Razor CSV, deals workbook, award sheets)\n\n` +
      `The emails send immediately and cannot be undone.`
    );
    if (!ok) return;
    setApprovingAll(true);
    try {
      const res = await api.post(`/deals/rounds/${id}/approve-all`, null, { timeout: 180000 });
      flash(`✓ ${res.data.approved} deal(s) approved — result emails are being sent to all assigned buyers. Exports are now available.`);
      load();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail) flash(detail, "err");
      else if (err.code === "ECONNABORTED") flash("Approval is taking longer than expected — refresh in a moment to confirm before retrying.", "err");
      else flash("Approval failed. Please try again.", "err");
    } finally {
      setApprovingAll(false);
    }
  }

  async function submitAwardLot() {
    if (!awardLot || !awardLot.buyerId) { flash("Select a buyer", "err"); return; }
    if (!awardLot.reason.trim()) { flash("Reason is required", "err"); return; }
    setAwardingLot(true);
    try {
      const res = await api.post(`/deals/rounds/${id}/award-lot`, {
        buyer_id: awardLot.buyerId,
        reason_note: awardLot.reason,
      });
      flash(`✓ All ${res.data.awarded} deals awarded to ${res.data.buyer}`);
      setAwardLot(null);
      load();
    } catch (err: any) {
      flash(err.response?.data?.detail || "Award lot failed", "err");
    } finally {
      setAwardingLot(false);
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
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  const pendingCount = deals.filter((d) => d.status === "pending_approval").length;
  const totalValue = deals.filter((d) => d.status !== "rejected").reduce((s, d) => s + d.total_value, 0);

  return (
    <AdminLayout>
      <div className="page-shell animate-in">
        <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Round Detail
        </Link>

        {/* Header */}
        <div className="page-header">
          <div className="page-header-text">
            <p className="page-eyebrow">Rounds</p>
            <h1 className="page-title">
              Deal Approval
            </h1>
            <p className="page-subtitle">
              {deals.length} deals · ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} total · Click any row to see all competing bids
            </p>
          </div>
          <div className="page-actions">
            <button
              onClick={() => setAwardLot({ buyerId: "", reason: "" })}
              className="btn-ghost"
              style={{ minHeight: "44px", whiteSpace: "nowrap" }}
            >
              Award Entire Lot
            </button>
            {pendingCount > 0 && (
              <button
                onClick={approveAll}
                disabled={approvingAll}
                className="btn-brand"
                style={{ background: "var(--success-strong)", minHeight: "44px", whiteSpace: "nowrap" }}
                title="Approve all pending deals and automatically send win/loss notices to buyers"
              >
                {approvingAll ? "Approving…" : `Approve All (${pendingCount})`}
              </button>
            )}
          </div>
        </div>

        {/* Spell out what approving actually does. It emails every buyer, which is the one
            step here that reaches outside the system and can't be taken back — the admin
            should know that before clicking, not discover it afterwards. */}
        {pendingCount > 0 && (
          <div style={{
            background: "rgba(5,150,105,0.06)",
            border: "1px solid rgba(5,150,105,0.25)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "14px 18px",
            marginBottom: "16px",
          }}>
            <p style={{ margin: "0 0 8px", fontSize: "0.8rem", fontWeight: 700, color: "var(--success)" }}>
              What happens when you click “Approve All ({pendingCount})”
            </p>
            <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "0.78rem", color: "var(--text-3, rgba(255,255,255,0.6))", lineHeight: 1.7 }}>
              <li>Every pending deal is locked in — winning buyer and price are recorded to the audit trail.</li>
              <li><strong style={{ color: "var(--text-1)" }}>Each assigned buyer is emailed their result automatically.</strong> Winners see the items they won. Buyers who were outbid see each item with their bid next to the winning price.</li>
              <li>Buyer scores are recalculated from this round’s wins and losses.</li>
              <li>Exports unlock: Razor CSV, deals workbook, and per-buyer award sheets.</li>
            </ol>
            <p style={{ margin: "8px 0 0", fontSize: "0.72rem", color: "var(--warning)" }}>
              The emails send immediately and cannot be recalled — review the deals below first.
              Need one buyer to take everything? Use “Award Entire Lot” before approving.
            </p>
          </div>
        )}

        {msg && (
          <div style={{
            marginBottom: "16px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "var(--success-dim)" : "var(--danger-dim)",
            border: `1px solid ${msgType === "ok" ? "var(--success-dim)" : "var(--danger-dim)"}`,
            color: msgType === "ok" ? "var(--success)" : "var(--danger)",
          }}>
            {msg}
          </div>
        )}

        {/* View toggle: per-device (default) vs summed-by-model. A per-device round is thousands
            of rows; the model view collapses them to one line per model with the total quantity. */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>View:</span>
          {(["device", "model"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchView(m)}
              className={viewMode === m ? "btn-brand" : "btn-ghost"}
              style={{ fontSize: "0.76rem", padding: "6px 14px" }}
            >
              {m === "device" ? "Per device" : "Summed by model"}
            </button>
          ))}
          {viewMode === "model" && rollup && (
            <span style={{ fontSize: "0.74rem", color: "var(--text-4)", marginLeft: "6px" }}>
              {rollup.total_models.toLocaleString()} models · {rollup.total_devices.toLocaleString()} devices · ${rollup.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>

        {viewMode === "model" ? (
          <div className="panel">
            {rollupLoading && <p style={{ padding: "24px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>Summing…</p>}
            {!rollupLoading && rollup && rollup.rollup.length === 0 && (
              <p style={{ padding: "24px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>No deals yet.</p>
            )}
            {!rollupLoading && rollup && rollup.rollup.length > 0 && (
              <table className="dark-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Avg Price</th>
                    <th style={{ textAlign: "right" }}>Total Value</th>
                    <th>Won by</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.rollup.map((r) => (
                    <tr key={r.model}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.84rem", fontFamily: "monospace" }}>{r.model}</div>
                        <div style={{ color: "var(--text-4)", fontSize: "0.72rem" }}>{r.description}</div>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-1)" }}>{r.qty.toLocaleString()}</td>
                      <td style={{ textAlign: "right", color: "var(--text-2)" }}>
                        {r.avg_price != null ? `$${r.avg_price.toFixed(2)}` : "—"}
                        {r.min_price != null && r.max_price != null && r.min_price !== r.max_price && (
                          <div style={{ fontSize: "0.68rem", color: "var(--text-4)" }}>${r.min_price.toFixed(2)}–${r.max_price.toFixed(2)}</div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--success)" }}>${r.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>
                        {r.buyers.map((b) => `${b.buyer} ×${b.qty}`).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
        <div className="panel">
          <table className="dark-table" style={{ width: "100%", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "28px" }} />
              <col style={{ width: "36%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "50px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead>
              <tr>
                <th><span className="sr-only">Expand</span></th>
                <th>Item</th>
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
                const isExpanded = expandedDeal === d.id;
                return (
                  <>
                    <tr
                      key={d.id}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        // Don't expand when clicking action buttons
                        if ((e.target as HTMLElement).closest("button")) return;
                        setExpandedDeal(isExpanded ? null : d.id);
                      }}
                    >
                      <td style={{ textAlign: "center", color: "var(--text-4)", fontSize: "0.7rem", paddingRight: 0 }}>
                        {isExpanded ? "▼" : "▶"}
                      </td>
                      <td style={{ overflow: "hidden" }}>
                        <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-3)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.part_number}</div>
                        <div style={{ fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</div>
                      </td>
                      <td style={{ fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, color: "var(--text-1)" }}>
                        {d.winner_company || "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>{d.quantity}</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", whiteSpace: "nowrap" }}>${d.winning_price.toFixed(2)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap" }}>
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
                            <span style={{ fontSize: "0.65rem", color: "var(--warning)" }}>
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
                                bg="var(--success-dim)" color="var(--success)" border="var(--success-dim)"
                                disabled={acting === d.id}
                                onClick={() => singleAction(d.id, "approve", "approved")}
                              />
                              <ActionBtn
                                label="Reject"
                                bg="var(--danger-dim)" color="var(--danger)" border="var(--danger-dim)"
                                disabled={acting === d.id}
                                onClick={() => singleAction(d.id, "reject", "rejected")}
                              />
                            </>
                          )}
                          <ActionBtn
                            label="Override"
                            bg="var(--warning-dim)" color="var(--warning)" border="var(--warning-dim)"
                            disabled={false}
                            onClick={() => setOverride({ dealId: d.id, partNumber: d.part_number, field: "", newValue: "", reason: "" })}
                          />
                          {d.status === "approved" && (
                            <ActionBtn
                              label="→ Razor"
                              bg="var(--brand-dim)" color="var(--info)" border="var(--brand-dim)"
                              disabled={acting === d.id}
                              onClick={() => singleAction(d.id, "push-razor", "pushed to Razor")}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${d.id}-bids`} style={{ background: "var(--surface)" }}>
                        <AllBidsPanel roundId={id as string} masterItemId={d.master_item_id} />
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Award Entire Lot Modal */}
        {awardLot && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "var(--modal-backdrop-bg)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}>
            <div style={{
              background: "var(--bg-2)",
              border: "1px solid var(--brand-dim)",
              borderRadius: "20px 20px 0 0",
              padding: "24px",
              width: "100%",
              maxWidth: "560px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "var(--surface-hover)", margin: "0 auto 20px" }} />
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 6px" }}>
                Award Entire Lot
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-3)", margin: "0 0 20px" }}>
                All {deals.length} deals will be reassigned to the selected buyer. Existing winner selections are overridden and deals return to pending approval.
              </p>

              <label style={labelStyle}>Select Buyer</label>
              <select
                value={awardLot.buyerId}
                onChange={(e) => setAwardLot({ ...awardLot, buyerId: e.target.value ? Number(e.target.value) : "" })}
                className="glass-input"
                style={{ marginBottom: 14 }}
              >
                <option value="">Choose buyer...</option>
                {roundBuyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.company_name || b.full_name} ({b.email})
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Reason (required)</label>
              <textarea
                value={awardLot.reason}
                onChange={(e) => setAwardLot({ ...awardLot, reason: e.target.value })}
                placeholder="e.g. Customer requested single-vendor award"
                rows={3}
                className="glass-input"
                style={{ marginBottom: 20, resize: "vertical" }}
              />

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={submitAwardLot}
                  disabled={awardingLot}
                  className="btn-brand"
                  style={{ flex: 1, minHeight: "48px", background: "#7c3aed" }}
                >
                  {awardingLot ? "Awarding…" : "Award Entire Lot"}
                </button>
                <button
                  type="button"
                  onClick={() => setAwardLot(null)}
                  className="btn-ghost"
                  style={{ flex: 1, minHeight: "48px" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Override Modal */}
        {override && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "var(--modal-backdrop-bg)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            padding: "0 0 env(safe-area-inset-bottom, 0)",
          }}>
            <div style={{
              background: "var(--bg-2)",
              border: "1px solid var(--brand-dim)",
              borderRadius: "20px 20px 0 0",
              padding: "24px",
              width: "100%",
              maxWidth: "560px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}>
              <div style={{
                width: "40px", height: "4px", borderRadius: "2px",
                background: "var(--surface-hover)", margin: "0 auto 20px",
              }} />
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 6px" }}>
                Override Deal
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-3)", margin: "0 0 24px" }}>
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
                <button
                  onClick={submitOverride}
                  disabled={submittingOverride}
                  className="btn-brand"
                  style={{ flex: 1, minHeight: "48px" }}
                >
                  {submittingOverride ? "Saving..." : "Save Override"}
                </button>
                <button
                  onClick={() => setOverride(null)}
                  className="btn-ghost"
                  style={{ flex: 1, minHeight: "48px" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function ActionBtn({ label, bg, color, border, disabled, onClick }: {
  label: string; bg: string; color: string; border: string;
  disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        minHeight: "36px",
        background: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: "8px",
        fontSize: "0.72rem",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        touchAction: "manipulation",
      }}
    >
      {label}
    </button>
  );
}
