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
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [r, s] = await Promise.all([
      api.get(`/rounds/${id}`).then((r) => r.data).catch(() => null),
      api.get(`/rounds/${id}/summary`).then((r) => r.data).catch(() => null),
    ]);
    setRound(r);
    setSummary(s);
  }

  useEffect(() => { load(); }, [id]);

  async function uploadMaster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/rounds/${id}/master-file`, fd);
      setMsg(`✓ Uploaded ${res.data.total.toLocaleString()} line items`);
      setMsgType("ok");
      load();
    } catch (err: any) {
      setMsg(`Error: ${err.response?.data?.detail || "Upload failed"}`);
      setMsgType("err");
    } finally {
      setUploading(false);
    }
  }

  async function changeStatus(action: string) {
    try {
      await api.post(`/rounds/${id}/${action}`);
      setMsg(`✓ Round ${action}ed`);
      setMsgType("ok");
      load();
    } catch (err: any) {
      setMsg(`Error: ${err.response?.data?.detail}`);
      setMsgType("err");
    }
  }

  async function processRound() {
    setProcessing(true);
    try {
      await api.post(`/rounds/${id}/process`);
      setMsg("Processing started — refresh in a few seconds");
      setMsgType("ok");
      setTimeout(load, 4000);
    } catch (err: any) {
      setMsg(`Error: ${err.response?.data?.detail}`);
      setMsgType("err");
    } finally {
      setProcessing(false);
    }
  }

  if (!round) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading...</div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div style={{ maxWidth: "820px" }}>
        {/* Back + title */}
        <Link href="/admin" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Back
        </Link>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "10px 0 4px" }}>
          {round.name}
        </h2>
        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
          {round.commodity} &bull; Status: <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{round.status}</span>
        </p>

        {/* Message banner */}
        {msg && (
          <div style={{
            marginBottom: "16px",
            padding: "11px 16px",
            borderRadius: "10px",
            fontSize: "0.83rem",
            background: msgType === "ok" ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: msgType === "ok" ? "#34d399" : "#f87171",
          }}>
            {msg}
          </div>
        )}

        {/* Master File */}
        <div style={card}>
          <h3 style={{ fontWeight: 600, color: "white", margin: "0 0 12px", fontSize: "0.95rem" }}>Master File</h3>
          {round.master_file_uploaded ? (
            <p style={{ fontSize: "0.85rem", color: "#34d399" }}>
              ✓ {round.total_line_items.toLocaleString()} line items loaded
            </p>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "#fbbf24" }}>No master file uploaded yet</p>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={uploadMaster} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-ghost"
            style={{ marginTop: "14px" }}
          >
            {uploading ? "Uploading..." : round.master_file_uploaded ? "Replace Master File" : "Upload Master File (.xlsx/.csv)"}
          </button>
        </div>

        {/* Controls */}
        <div style={card}>
          <h3 style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.95rem" }}>Round Controls</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {round.status === "draft" && (
              <button onClick={() => changeStatus("open")} className="btn-brand" style={{ background: "#059669" }}>
                Open Round (Invite Buyers)
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

        {/* Summary stats */}
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
                ["Total Deal Value", `$${summary.total_deal_value.toLocaleString()}`],
              ].map(([label, value]) => (
                <div key={label} style={{
                  padding: "16px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                  <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "white", margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exports */}
        {round.status === "complete" && (
          <div style={card}>
            <h3 style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.95rem" }}>Exports & Actions</h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <a href={`http://localhost:8000/api/rounds/${id}/export/deals.xlsx`} className="btn-brand" style={{ background: "#059669", textDecoration: "none" }}>
                Download Deals (.xlsx)
              </a>
              <a href={`http://localhost:8000/api/rounds/${id}/export/deals.csv`} className="btn-ghost" style={{ textDecoration: "none" }}>
                Download (.csv)
              </a>
              <a href={`http://localhost:8000/api/rounds/${id}/export/comparison.xlsx`} className="btn-brand" style={{ textDecoration: "none" }}>
                Full Comparison (.xlsx)
              </a>
              <Link href={`/admin/rounds/${id}/exceptions`} className="btn-brand" style={{ background: "#dc2626", textDecoration: "none" }}>
                Review Exceptions
              </Link>
              <Link href={`/admin/rounds/${id}/deals`} className="btn-brand" style={{ background: "#7c3aed", textDecoration: "none" }}>
                Approve Deals
              </Link>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
