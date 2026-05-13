"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Round {
  id: number;
  name: string;
  commodity: string;
  customer: string | null;
  status: string;
  total_line_items: number;
  master_file_uploaded: boolean;
  submission_deadline: string | null;
}

interface Summary {
  total_bid_lines: number;
  matched: number;
  exceptions: number;
  winners: number;
  deals: number;
  total_deal_value: number;
  exception_breakdown: Record<string, number>;
}

interface AssignedBuyer {
  id: number;
  full_name: string;
  email: string;
  company_name: string;
  invite_status: string;
}

interface AllBuyer {
  id: number;
  full_name: string;
  email: string;
  company_name: string;
  is_active: boolean;
}

const statusColor: Record<string, string> = {
  pending: "rgba(255,255,255,0.35)",
  sent: "#60a5fa",
  uploaded: "#34d399",
  processing: "#fbbf24",
  ready: "#a78bfa",
  error: "#f87171",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "28px",
  marginBottom: "16px",
};

export default function RoundDetail() {
  const { id } = useParams();
  const [round, setRound] = useState<Round | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [assignedBuyers, setAssignedBuyers] = useState<AssignedBuyer[]>([]);
  const [allBuyers, setAllBuyers] = useState<AllBuyer[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [showBuyerPicker, setShowBuyerPicker] = useState(false);
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  }

  async function load() {
    const [r, s, ab] = await Promise.all([
      api.get(`/rounds/${id}`).then((r) => r.data).catch(() => null),
      api.get(`/rounds/${id}/summary`).then((r) => r.data).catch(() => null),
      api.get(`/rounds/${id}/buyers`).then((r) => r.data).catch(() => []),
    ]);
    setRound(r);
    setSummary(s);
    setAssignedBuyers(ab);
    setSelectedBuyerIds(new Set(ab.map((b: AssignedBuyer) => b.id)));
  }

  useEffect(() => { load(); }, [id]);

  async function loadAllBuyers() {
    const res = await api.get("/auth/buyers");
    setAllBuyers(res.data);
  }

  async function uploadMaster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/rounds/${id}/master-file`, fd);
      flash(`✓ Uploaded ${res.data.total.toLocaleString()} line items`);
      load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail || "Upload failed"}`, "err");
    } finally {
      setUploading(false);
    }
  }

  async function changeStatus(action: string) {
    try {
      await api.post(`/rounds/${id}/${action}`);
      flash(`✓ Round ${action}ed`);
      load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail}`, "err");
    }
  }

  async function processRound() {
    setProcessing(true);
    try {
      await api.post(`/rounds/${id}/process`);
      flash("Processing started — refreshing in 5s");
      setTimeout(load, 5000);
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail}`, "err");
    } finally {
      setProcessing(false);
    }
  }

  async function saveBuyerAssignment() {
    try {
      await api.post(`/rounds/${id}/buyers`, { buyer_ids: [...selectedBuyerIds] });
      flash("✓ Buyers assigned");
      setShowBuyerPicker(false);
      load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail || "Failed to assign buyers"}`, "err");
    }
  }

  async function sendInvitations() {
    setSending(true);
    try {
      const res = await api.post(`/rounds/${id}/send-invitations`);
      flash(`✓ Invitations sent to ${res.data.sent} buyer(s)`);
      load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail || "Failed to send invitations"}`, "err");
    } finally {
      setSending(false);
    }
  }

  function toggleBuyer(buyerId: number) {
    setSelectedBuyerIds((prev) => {
      const next = new Set(prev);
      if (next.has(buyerId)) next.delete(buyerId);
      else next.add(buyerId);
      return next;
    });
  }

  if (!round) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  const API_BASE = "http://localhost:8000/api";

  return (
    <AdminLayout>
      <div style={{ maxWidth: "860px" }}>
        <Link href="/admin/rounds" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Bid Rounds
        </Link>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "10px 0 4px" }}>
          {round.name}
        </h2>
        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
          {round.commodity}{round.customer ? ` · ${round.customer}` : ""} · Status: <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{round.status}</span>
        </p>

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

        {/* ── Master File ─── */}
        <div style={card}>
          <h3 style={{ fontWeight: 600, color: "white", margin: "0 0 12px", fontSize: "0.95rem" }}>Master File</h3>
          {round.master_file_uploaded ? (
            <p style={{ fontSize: "0.85rem", color: "#34d399", margin: "0 0 12px" }}>
              ✓ {round.total_line_items.toLocaleString()} line items loaded
            </p>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "#fbbf24", margin: "0 0 12px" }}>No master file uploaded yet</p>
          )}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={uploadMaster} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-ghost">
              {uploading ? "Uploading..." : round.master_file_uploaded ? "Replace Master File" : "Upload Master File (.xlsx/.csv)"}
            </button>
            {round.master_file_uploaded && (
              <a
                href={`${API_BASE}/rounds/${id}/generate-template`}
                className="btn-brand"
                style={{ textDecoration: "none" }}
                target="_blank"
                rel="noreferrer"
              >
                ↓ Download Bid Template
              </a>
            )}
          </div>
        </div>

        {/* ── Assigned Buyers ─── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3 style={{ fontWeight: 600, color: "white", margin: 0, fontSize: "0.95rem" }}>
              Assigned Buyers ({assignedBuyers.length})
            </h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { setShowBuyerPicker(!showBuyerPicker); loadAllBuyers(); }}
                className="btn-ghost"
                style={{ fontSize: "0.78rem" }}
              >
                {showBuyerPicker ? "Cancel" : "Assign Buyers"}
              </button>
              {assignedBuyers.length > 0 && round.master_file_uploaded && (
                <button onClick={sendInvitations} disabled={sending} className="btn-brand" style={{ fontSize: "0.78rem" }}>
                  {sending ? "Sending..." : "Send Invitations"}
                </button>
              )}
            </div>
          </div>

          {showBuyerPicker && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(61,129,227,0.25)",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
            }}>
              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", margin: "0 0 12px" }}>
                Select buyers to assign to this round:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "240px", overflowY: "auto" }}>
                {allBuyers.filter((b) => b.is_active).map((b) => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "8px", borderRadius: "8px", background: selectedBuyerIds.has(b.id) ? "rgba(61,129,227,0.12)" : "transparent" }}>
                    <input
                      type="checkbox"
                      checked={selectedBuyerIds.has(b.id)}
                      onChange={() => toggleBuyer(b.id)}
                      style={{ accentColor: "#3D81E3" }}
                    />
                    <span style={{ fontSize: "0.83rem", color: "white" }}>{b.full_name}</span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>{b.company_name || b.email}</span>
                  </label>
                ))}
              </div>
              <button onClick={saveBuyerAssignment} className="btn-brand" style={{ marginTop: "12px", fontSize: "0.8rem" }}>
                Save Assignment
              </button>
            </div>
          )}

          {assignedBuyers.length === 0 ? (
            <p style={{ fontSize: "0.83rem", color: "rgba(255,255,255,0.3)" }}>
              No buyers assigned yet. Click "Assign Buyers" to add buyers to this round.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {assignedBuyers.map((b) => (
                <div key={b.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "10px",
                }}>
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "white" }}>{b.full_name}</span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginLeft: "10px" }}>{b.company_name || b.email}</span>
                  </div>
                  <span style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    padding: "2px 10px",
                    borderRadius: "100px",
                    background: "rgba(255,255,255,0.06)",
                    color: statusColor[b.invite_status] || "white",
                    textTransform: "capitalize",
                  }}>
                    {b.invite_status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Round Controls ─── */}
        <div style={card}>
          <h3 style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.95rem" }}>Round Controls</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {round.status === "draft" && (
              <button onClick={() => changeStatus("open")} className="btn-brand" style={{ background: "#059669" }}>
                Open Round
              </button>
            )}
            {round.status === "open" && (
              <button onClick={() => changeStatus("close")} className="btn-brand" style={{ background: "#d97706" }}>
                Close Round
              </button>
            )}
            {round.status === "closed" && (
              <button onClick={processRound} disabled={processing} className="btn-brand">
                {processing ? "Processing..." : "Process Bids & Select Winners"}
              </button>
            )}
          </div>
        </div>

        {/* ── Summary ─── */}
        {summary && (
          <div style={card}>
            <h3 style={{ fontWeight: 600, color: "white", margin: "0 0 20px", fontSize: "0.95rem" }}>Round Summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {[
                ["Total Bid Lines", summary.total_bid_lines.toLocaleString()],
                ["Matched", summary.matched.toLocaleString()],
                ["Exceptions", summary.exceptions.toLocaleString()],
                ["Winners", summary.winners.toLocaleString()],
                ["Deals Created", summary.deals.toLocaleString()],
                ["Deal Value", `$${summary.total_deal_value.toLocaleString()}`],
              ].map(([label, value]) => (
                <div key={label} style={{
                  padding: "16px", background: "rgba(255,255,255,0.04)",
                  borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                  <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "white", margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Participation Tracker (always visible when buyers assigned) ── */}
        {assignedBuyers.length > 0 && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontWeight: 600, color: "white", margin: 0, fontSize: "0.95rem" }}>Buyer Participation</h3>
              <Link href={`/admin/rounds/${id}/participation`} className="btn-ghost" style={{ textDecoration: "none", fontSize: "0.78rem" }}>
                Live Tracker →
              </Link>
            </div>
            <div style={{ marginTop: "12px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
              {[
                { label: "Invited", count: assignedBuyers.filter((b) => b.invite_status !== "pending").length, color: "#60a5fa" },
                { label: "Uploaded", count: assignedBuyers.filter((b) => b.invite_status === "uploaded" || b.invite_status === "ready").length, color: "#34d399" },
                { label: "Pending", count: assignedBuyers.filter((b) => b.invite_status === "pending").length, color: "rgba(255,255,255,0.3)" },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color }}>{count}</p>
                  <p style={{ margin: 0, fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Exports & Actions ─── */}
        {(round.status === "complete" || round.status === "processing") && (
          <div style={card}>
            <h3 style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.95rem" }}>Exports & Actions</h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link href={`/admin/rounds/${id}/comparison`} className="btn-brand" style={{ textDecoration: "none" }}>
                Bid Comparison Table
              </Link>
              <Link href={`/admin/rounds/${id}/deals`} className="btn-brand" style={{ background: "#7c3aed", textDecoration: "none" }}>
                Approve Deals
              </Link>
              <Link href={`/admin/rounds/${id}/exceptions`} className="btn-brand" style={{ background: "#dc2626", textDecoration: "none" }}>
                Review Exceptions
              </Link>
              <Link href={`/admin/rounds/${id}/analytics`} className="btn-brand" style={{ background: "#0d7c66", textDecoration: "none" }}>
                Analytics →
              </Link>
              <Link href={`/admin/rounds/${id}/export`} className="btn-ghost" style={{ textDecoration: "none" }}>
                Export Center →
              </Link>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
