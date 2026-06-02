"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";
import Link from "next/link";

interface Round {
  id: number; name: string; commodity: string; customer: string | null;
  status: string; total_line_items: number; master_file_uploaded: boolean;
  submission_deadline: string | null;
}
interface Summary {
  total_bid_lines: number; matched: number; exceptions: number;
  winners: number; deals: number; total_deal_value: number;
  exception_breakdown: Record<string, number>;
}
interface ProcessingStatus {
  status: string; total_lines: number; matched: number;
  exceptions: number; deals: number; progress_pct: number;
}
interface AssignedBuyer {
  id: number; full_name: string; email: string; company_name: string; invite_status: string;
}
interface BidFileEntry {
  id: number; buyer_id: number; buyer_name: string | null; buyer_company: string | null;
  filename: string; file_size_bytes: number | null; lines_parsed: number;
  status: string; uploaded_at: string | null; has_file: boolean;
}
interface AllBuyer {
  id: number; full_name: string; email: string; company_name: string; is_active: boolean;
}

const INVITE_BADGE: Record<string, string> = {
  pending: "badge-draft", sent: "badge-processing", uploaded: "badge-open", ready: "badge-complete",
};
const STATUS_BADGE: Record<string, string> = {
  draft: "badge-draft", open: "badge-open", closed: "badge-closed",
  processing: "badge-processing", complete: "badge-complete", error: "badge-error",
};
const COMMODITY_ICON: Record<string, string> = {
  laptops: "💻", desktops: "🖥", servers: "🖧", networking: "🌐",
  storage: "💾", peripherals: "🖱", other: "📦",
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function RoundDetail() {
  const { id } = useParams();
  const [round, setRound] = useState<Round | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [assignedBuyers, setAssignedBuyers] = useState<AssignedBuyer[]>([]);
  const [allBuyers, setAllBuyers] = useState<AllBuyer[]>([]);
  const [bidFiles, setBidFiles] = useState<BidFileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingFile, setDeletingFile] = useState<number | null>(null);
  const [sendingResults, setSendingResults] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [showBuyerPicker, setShowBuyerPicker] = useState(false);
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  }

  async function load() {
    const [r, s, ab, bf] = await Promise.all([
      api.get(`/rounds/${id}`).then(r => r.data).catch(() => null),
      api.get(`/rounds/${id}/summary`).then(r => r.data).catch(() => null),
      api.get(`/rounds/${id}/buyers`).then(r => r.data).catch(() => []),
      api.get(`/rounds/${id}/bid-files`).then(r => r.data).catch(() => []),
    ]);
    setRound(r); setSummary(s); setAssignedBuyers(ab);
    setSelectedBuyerIds(new Set(ab.map((b: AssignedBuyer) => b.id)));
    setBidFiles(bf);
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (round?.status === "processing") {
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get(`/rounds/${id}/processing-status`);
          setProcessingStatus(res.data);
          if (res.data.status !== "processing") {
            clearInterval(pollRef.current!); pollRef.current = null; load();
          }
        } catch { /* ignore */ }
      }, 3000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setProcessingStatus(null);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [round?.status, id]);

  async function loadAllBuyers() {
    const res = await api.get("/auth/buyers");
    setAllBuyers(res.data);
  }

  async function uploadMaster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await api.post(`/rounds/${id}/master-file`, fd);
      flash(`✓ Uploaded ${res.data.total.toLocaleString()} line items`); load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail || "Upload failed"}`, "err");
    } finally { setUploading(false); }
  }

  async function changeStatus(action: string) {
    try {
      await api.post(`/rounds/${id}/${action}`);
      flash(`✓ Round ${action}ed`); load();
    } catch (err: any) { flash(`Error: ${err.response?.data?.detail}`, "err"); }
  }

  async function processRound() {
    setProcessing(true);
    try {
      await api.post(`/rounds/${id}/process`);
      flash("Processing started — refreshing in 5s"); setTimeout(load, 5000);
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail}`, "err");
    } finally { setProcessing(false); }
  }

  async function runAiMatch() {
    setAiRunning(true);
    try {
      const res = await api.post(`/rounds/${id}/ai-match`);
      flash(`✓ ${res.data.message || "AI matching started"} — refresh in 15–30 seconds`);
      setTimeout(load, 20000);
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail || "AI match failed"}`, "err");
    } finally { setAiRunning(false); }
  }

  async function deleteFile(fileId: number) {
    if (!confirm("Delete this bid file and all its bid lines? This cannot be undone.")) return;
    setDeletingFile(fileId);
    try {
      await api.delete(`/rounds/${id}/bid-files/${fileId}`);
      flash("✓ File deleted"); load();
    } catch (err: any) {
      flash(err.response?.data?.detail || "Delete failed", "err");
    } finally { setDeletingFile(null); }
  }

  async function sendResultsNotifications() {
    setSendingResults(true);
    try {
      const res = await api.post(`/rounds/${id}/send-results`);
      flash(`✓ Loss notices sent to ${res.data.sent} buyer(s)`);
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to send loss notices", "err");
    } finally { setSendingResults(false); }
  }

  async function reopenRound() {
    setReopening(true);
    try {
      await api.post(`/rounds/${id}/reopen`);
      flash("Round reopened — buyers can submit again"); load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail}`, "err");
    } finally { setReopening(false); }
  }

  async function saveBuyerAssignment() {
    try {
      await api.post(`/rounds/${id}/buyers`, { buyer_ids: [...selectedBuyerIds] });
      flash("✓ Buyers assigned"); setShowBuyerPicker(false); load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail || "Failed to assign buyers"}`, "err");
    }
  }

  async function sendInvitations() {
    setSending(true);
    try {
      const res = await api.post(`/rounds/${id}/send-invitations`);
      flash(`✓ Invitations sent to ${res.data.sent} buyer(s)`); load();
    } catch (err: any) {
      flash(`Error: ${err.response?.data?.detail || "Failed to send invitations"}`, "err");
    } finally { setSending(false); }
  }

  function toggleBuyer(buyerId: number) {
    setSelectedBuyerIds(prev => {
      const next = new Set(prev);
      if (next.has(buyerId)) next.delete(buyerId); else next.add(buyerId);
      return next;
    });
  }

  if (!round) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  const uploadedCount = assignedBuyers.filter(b => b.invite_status === "uploaded" || b.invite_status === "ready").length;
  const pendingCount = assignedBuyers.filter(b => b.invite_status === "pending").length;

  return (
    <AdminLayout>
      <div style={{ maxWidth: "900px" }} className="animate-in">

        {/* Breadcrumb */}
        <Link href="/admin/rounds" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "20px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Bid Rounds
        </Link>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "13px", background: "rgba(61,129,227,0.1)", border: "1px solid rgba(61,129,227,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
              {COMMODITY_ICON[round.commodity] || "📦"}
            </div>
            <div>
              <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "white", letterSpacing: "-0.04em", margin: "0 0 6px", lineHeight: 1.1 }}>
                {round.name}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span className={`badge ${STATUS_BADGE[round.status] || "badge-draft"}`}>{round.status}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-4)", textTransform: "capitalize" }}>{round.commodity}</span>
                {round.customer && <><span style={{ color: "var(--border-mid)" }}>·</span><span style={{ fontSize: "0.75rem", color: "var(--text-4)" }}>{round.customer}</span></>}
                {round.submission_deadline && <><span style={{ color: "var(--border-mid)" }}>·</span><span style={{ fontSize: "0.75rem", color: "#fbbf24" }}>Due {new Date(round.submission_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></>}
                <span style={{ fontSize: "0.68rem", color: "var(--text-4)", fontFamily: "monospace" }}>#{round.id}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Flash message */}
        {msg && (
          <div style={{
            marginBottom: "20px", padding: "12px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: msgType === "ok" ? "#34d399" : "#f87171",
          }}>
            {msg}
          </div>
        )}

        {/* ── Summary stats (when available) ── */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px" }}>
            {[
              { label: "Bid Lines",   val: summary.total_bid_lines.toLocaleString(), color: "white",   bg: "rgba(255,255,255,0.03)" },
              { label: "Matched",     val: summary.matched.toLocaleString(),          color: "#34d399", bg: "rgba(16,185,129,0.06)" },
              { label: "Exceptions",  val: summary.exceptions.toLocaleString(),       color: summary.exceptions > 0 ? "#fb923c" : "var(--text-3)", bg: summary.exceptions > 0 ? "rgba(251,146,60,0.06)" : "rgba(255,255,255,0.03)" },
              { label: "Winners",     val: summary.winners.toLocaleString(),          color: "#a78bfa", bg: "rgba(139,92,246,0.06)" },
              { label: "Deals",       val: summary.deals.toLocaleString(),            color: "#60a5fa", bg: "rgba(61,129,227,0.06)" },
              { label: "Deal Value",  val: `$${summary.total_deal_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "#34d399", bg: "rgba(16,185,129,0.06)" },
            ].map(({ label, val, color, bg }) => (
              <div key={label} style={{ padding: "16px 18px", background: bg, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <p style={{ fontSize: "0.65rem", color: "var(--text-4)", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{label}</p>
                <p style={{ fontSize: "1.45rem", fontWeight: 800, color, margin: 0, letterSpacing: "-0.03em" }}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Round Controls ── */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "16px" }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 14px" }}>Round Controls</p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {round.status === "draft" && (
              <button onClick={() => changeStatus("open")} className="btn-brand" style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}
                aria-label="Open this round to start accepting bids">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="5 12 12 5 19 12"/><polyline points="5 19 12 12 19 19"/></svg>
                Open Round
              </button>
            )}
            {round.status === "open" && (
              <button onClick={() => changeStatus("close")} className="btn-brand" style={{ background: "linear-gradient(135deg,#b45309,#f59e0b)" }}
                aria-label="Close bidding and prepare for processing">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                Close Round
              </button>
            )}
            {round.status === "closed" && (
              <>
                <button onClick={processRound} disabled={processing} className="btn-brand"
                  aria-label="Run matching engine and select winners">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {processing ? "Starting…" : "Process Bids & Select Winners"}
                </button>
                <button onClick={reopenRound} disabled={reopening} className="btn-ghost"
                  aria-label="Reopen round so buyers can submit again">
                  {reopening ? "Reopening…" : "Reopen Round"}
                </button>
              </>
            )}
            {round.status === "error" && (
              <button onClick={reopenRound} disabled={reopening} className="btn-brand" style={{ background: "linear-gradient(135deg,#b45309,#f59e0b)" }}
                aria-label="Reopen round after processing error">
                {reopening ? "Reopening…" : "Reopen Round (fix error)"}
              </button>
            )}
            {(round.status === "complete" || round.status === "processing") && summary && summary.exceptions > 0 && (
              <button onClick={runAiMatch} disabled={aiRunning} className="btn-ghost"
                style={{ borderColor: "rgba(167,139,250,0.4)", color: "#a78bfa" }}
                title="Re-run AI fuzzy matching on unresolved exceptions using Groq">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                {aiRunning ? "Running AI…" : `AI Match (${summary.exceptions} exceptions)`}
              </button>
            )}
          </div>

          {/* Processing progress */}
          {round.status === "processing" && (
            <div style={{ marginTop: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.82rem", color: "#60a5fa", fontWeight: 600 }}>Matching bid lines and selecting winners…</span>
                <span style={{ fontSize: "0.82rem", color: "var(--text-3)", fontFamily: "monospace" }}>
                  {processingStatus ? `${processingStatus.progress_pct}%` : "—"}
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${processingStatus?.progress_pct ?? 0}%` }} />
              </div>
              {processingStatus && (
                <div style={{ display: "flex", gap: "24px", marginTop: "14px", flexWrap: "wrap" }}>
                  {[["Lines", processingStatus.total_lines], ["Matched", processingStatus.matched], ["Exceptions", processingStatus.exceptions], ["Deals", processingStatus.deals]].map(([label, val]) => (
                    <div key={label as string}>
                      <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>{(val as number).toLocaleString()}</p>
                      <p style={{ margin: 0, fontSize: "0.68rem", color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Exports & Actions (complete/processing) ── */}
        {(round.status === "complete" || round.status === "processing") && (
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "16px" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 14px" }}>Exports & Actions</p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link href={`/admin/rounds/${id}/comparison`} className="btn-brand" style={{ textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                Bid Comparison
              </Link>
              <Link href={`/admin/rounds/${id}/deals`} className="btn-brand" style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Approve Deals
              </Link>
              <Link href={`/admin/rounds/${id}/exceptions`} className="btn-brand" style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Exceptions
              </Link>
              <Link href={`/admin/rounds/${id}/analytics`} className="btn-ghost" style={{ textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                Analytics
              </Link>
              <Link href={`/admin/rounds/${id}/export`} className="btn-ghost" style={{ textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Center
              </Link>
              <button
                onClick={sendResultsNotifications}
                disabled={sendingResults}
                className="btn-ghost"
                style={{ borderColor: "rgba(16,185,129,0.4)", color: "#34d399" }}
                title="Resend win/loss notice emails to all assigned buyers (auto-sent on Approve All)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                {sendingResults ? "Sending…" : "Resend Loss Notices"}
              </button>
            </div>
          </div>
        )}

        {/* ── Master File ── */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>Master File</p>
              {round.master_file_uploaded ? (
                <p style={{ fontSize: "0.88rem", color: "#34d399", margin: 0, fontWeight: 600 }}>
                  ✓ {round.total_line_items.toLocaleString()} line items loaded
                </p>
              ) : (
                <p style={{ fontSize: "0.88rem", color: "#fbbf24", margin: 0 }}>No master file uploaded yet</p>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc" style={{ display: "none" }} onChange={uploadMaster} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-ghost" style={{ fontSize: "0.8rem" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {uploading ? "Uploading…" : round.master_file_uploaded ? "Replace File" : "Upload Master File"}
              </button>
              {round.master_file_uploaded && (
                <button onClick={() => downloadFile(`/rounds/${id}/generate-template`, `bid_template_${round.name.replace(/\s+/g, "_")}_${id}.xlsx`)} className="btn-brand" style={{ fontSize: "0.8rem" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Bid Template
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Assigned Buyers ── */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px" }}>Assigned Buyers</p>
              <div style={{ display: "flex", gap: "14px" }}>
                <span style={{ fontSize: "0.8rem", color: "white", fontWeight: 600 }}>{assignedBuyers.length} total</span>
                {assignedBuyers.length > 0 && (
                  <>
                    <span style={{ fontSize: "0.8rem", color: "#34d399" }}>{uploadedCount} submitted</span>
                    {pendingCount > 0 && <span style={{ fontSize: "0.8rem", color: "var(--text-4)" }}>{pendingCount} pending</span>}
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setShowBuyerPicker(!showBuyerPicker); if (!showBuyerPicker) loadAllBuyers(); }} className="btn-ghost" style={{ fontSize: "0.78rem" }}>
                {showBuyerPicker ? "Cancel" : "Assign Buyers"}
              </button>
              {assignedBuyers.length > 0 && round.master_file_uploaded && (
                <button onClick={sendInvitations} disabled={sending} className="btn-brand" style={{ fontSize: "0.78rem" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  {sending ? "Sending…" : "Send Invitations"}
                </button>
              )}
            </div>
          </div>

          {showBuyerPicker && (
            <div style={{ background: "rgba(61,129,227,0.04)", border: "1px solid rgba(61,129,227,0.2)", borderRadius: "var(--radius-lg)", padding: "16px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <p style={{ fontSize: "0.78rem", color: "var(--text-4)", margin: 0 }}>Select buyers to assign:</p>
                <button
                  onClick={() => {
                    const active = allBuyers.filter(b => b.is_active);
                    setSelectedBuyerIds(selectedBuyerIds.size === active.length ? new Set() : new Set(active.map(b => b.id)));
                  }}
                  style={{ fontSize: "0.73rem", color: "#60a5fa", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                >
                  {selectedBuyerIds.size === allBuyers.filter(b => b.is_active).length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "240px", overflowY: "auto" }}>
                {allBuyers.filter(b => b.is_active).map(b => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "9px 10px", borderRadius: "var(--radius-sm)", background: selectedBuyerIds.has(b.id) ? "rgba(61,129,227,0.12)" : "transparent", transition: "background 0.1s" }}>
                    <input type="checkbox" checked={selectedBuyerIds.has(b.id)} onChange={() => toggleBuyer(b.id)} style={{ accentColor: "#3D81E3" }} />
                    <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(61,129,227,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, color: "#60a5fa", flexShrink: 0 }}>
                      {initials(b.full_name)}
                    </div>
                    <span style={{ fontSize: "0.83rem", color: "white", fontWeight: 500 }}>{b.full_name}</span>
                    <span style={{ fontSize: "0.73rem", color: "var(--text-4)" }}>{b.company_name || b.email}</span>
                  </label>
                ))}
              </div>
              <button onClick={saveBuyerAssignment} className="btn-brand" style={{ marginTop: "12px", fontSize: "0.8rem" }}>
                Save Assignment
              </button>
            </div>
          )}

          {assignedBuyers.length === 0 ? (
            <p style={{ fontSize: "0.83rem", color: "var(--text-4)", margin: 0 }}>No buyers assigned yet. Click "Assign Buyers" to add buyers to this round.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {assignedBuyers.map(b => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(61,129,227,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "#60a5fa", flexShrink: 0 }}>
                      {initials(b.full_name)}
                    </div>
                    <div>
                      <Link href={`/admin/rounds/${id}/buyers/${b.id}`} style={{ fontSize: "0.85rem", fontWeight: 600, color: "white", textDecoration: "none", display: "block" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#60a5fa"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "white"; }}>
                        {b.full_name}
                      </Link>
                      <p style={{ fontSize: "0.73rem", color: "var(--text-4)", margin: 0 }}>{b.company_name || b.email}</p>
                    </div>
                  </div>
                  <span className={`badge ${INVITE_BADGE[b.invite_status] || "badge-draft"}`}>{b.invite_status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Submitted Bid Files ── */}
        {bidFiles.length > 0 && (
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "16px" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 14px" }}>
              Submitted Bid Files ({bidFiles.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {bidFiles.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "3px" }}>
                      <Link href={`/admin/rounds/${id}/buyers/${f.buyer_id}`} style={{ fontSize: "0.85rem", fontWeight: 600, color: "#60a5fa", textDecoration: "none" }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                        {f.buyer_company || f.buyer_name || `Buyer ${f.buyer_id}`}
                      </Link>
                      <span className={`badge ${f.status === "processed" ? "badge-complete" : "badge-error"}`}>{f.status}</span>
                    </div>
                    <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.73rem", color: "var(--text-4)", fontFamily: "monospace" }}>{f.filename}</span>
                      <span style={{ fontSize: "0.73rem", color: "var(--text-4)" }}>{f.lines_parsed} lines</span>
                      {f.file_size_bytes && <span style={{ fontSize: "0.73rem", color: "var(--text-4)" }}>{(f.file_size_bytes / 1024).toFixed(1)} KB</span>}
                      {f.uploaded_at && <span style={{ fontSize: "0.73rem", color: "var(--text-4)" }}>{new Date(f.uploaded_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {f.has_file ? (
                      <button onClick={() => downloadFile(`/rounds/${id}/bid-files/${f.id}/download`, f.filename)} className="btn-ghost" style={{ fontSize: "0.75rem", padding: "6px 14px", whiteSpace: "nowrap" }}>
                        ↓ Download
                      </button>
                    ) : (
                      <button onClick={() => downloadFile(`/rounds/${id}/bid-files/${f.id}/reconstruct`, f.filename.replace(/\.[^.]+$/, "_reconstructed.xlsx"))} className="btn-ghost" style={{ fontSize: "0.75rem", padding: "6px 14px", whiteSpace: "nowrap", borderColor: "rgba(251,191,36,0.3)", color: "#fbbf24" }} title="Original file not on disk — reconstructed from parsed bid line data">
                        ↓ Reconstructed
                      </button>
                    )}
                    <button
                      onClick={() => deleteFile(f.id)}
                      disabled={deletingFile === f.id}
                      title="Delete this bid file and its bid lines"
                      style={{
                        padding: "6px 12px", fontSize: "0.75rem", whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
                        background: "rgba(239,68,68,0.08)", color: "#f87171",
                        border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px",
                      }}
                    >
                      {deletingFile === f.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Buyer Participation ── */}
        {assignedBuyers.length > 0 && (
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Buyer Participation</p>
              <Link href={`/admin/rounds/${id}/participation`} className="btn-ghost" style={{ textDecoration: "none", fontSize: "0.78rem" }}>
                Live Tracker →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {[
                { label: "Invited",  count: assignedBuyers.filter(b => b.invite_status !== "pending").length, color: "#60a5fa", bg: "rgba(61,129,227,0.08)" },
                { label: "Uploaded", count: uploadedCount,  color: "#34d399", bg: "rgba(16,185,129,0.08)" },
                { label: "Pending",  count: pendingCount,   color: "var(--text-3)", bg: "rgba(255,255,255,0.03)" },
              ].map(({ label, count, color, bg }) => (
                <div key={label} style={{ padding: "14px 16px", background: bg, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                  <p style={{ fontSize: "1.6rem", fontWeight: 800, color, margin: "0 0 3px", letterSpacing: "-0.04em" }}>{count}</p>
                  <p style={{ fontSize: "0.68rem", color: "var(--text-4)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
