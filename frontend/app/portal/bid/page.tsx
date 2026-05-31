"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";

interface Round {
  id: number; name: string; commodity: string;
  customer: string | null; deadline: string | null;
  invite_status: string | null; assigned: boolean;
}

function SubmitBidInner() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("round");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(preselect ? Number(preselect) : null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get("/buyer/rounds").then(r => {
      setRounds(r.data);
      if (preselect && !selectedRound) setSelectedRound(Number(preselect));
    });
  }, []);

  async function uploadFile(file: File) {
    if (!selectedRound) return;
    setUploading(true); setMsg(""); setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/buyer/rounds/${selectedRound}/bid`, fd);
      setMsg(`${res.data.message || "Bid submitted successfully!"} — <a href="/portal/submission?round=${selectedRound}" style="color:#34d399;font-weight:600">View parsed lines →</a>`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed. Check your file matches the template format.");
    } finally { setUploading(false); }
  }

  const round = rounds.find(r => r.id === selectedRound);

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "620px" }} className="animate-in">

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "white", letterSpacing: "-0.04em", margin: "0 0 4px" }}>Submit a Bid</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Upload your priced Excel or CSV for an open round.</p>
        </div>

        {rounds.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "72px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>📭</div>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>No open rounds</p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Check back after receiving an invitation from ThinkTLS.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Round selector */}
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "22px" }}>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-4)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Select Round
              </label>
              <select value={selectedRound ?? ""} onChange={e => setSelectedRound(Number(e.target.value))} className="glass-input">
                <option value="">— Choose a bid round —</option>
                {rounds.map(r => <option key={r.id} value={r.id}>{r.name} ({r.commodity})</option>)}
              </select>

              {round && (
                <div style={{ marginTop: "14px", padding: "12px 14px", background: "rgba(61,129,227,0.06)", border: "1px solid rgba(61,129,227,0.12)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      {round.deadline && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 500 }}>Deadline: {new Date(round.deadline).toLocaleString()}</span>
                        </div>
                      )}
                      {round.customer && <p style={{ fontSize: "0.73rem", color: "var(--text-4)", margin: 0 }}>Customer: {round.customer}</p>}
                    </div>
                    <button onClick={() => downloadFile(`/buyer/rounds/${selectedRound}/template`, `bid_template_round_${selectedRound}.xlsx`)}
                      className="btn-ghost" style={{ fontSize: "0.75rem", padding: "6px 14px" }}>
                      ↓ Download Template
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }}
              onClick={() => selectedRound && !uploading && fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "rgba(61,129,227,0.7)" : selectedRound ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: "var(--radius-xl)", padding: "56px 32px", textAlign: "center",
                cursor: selectedRound && !uploading ? "pointer" : "default",
                background: dragOver ? "rgba(61,129,227,0.06)" : "var(--bg-2)",
                transition: "all 0.2s", position: "relative", overflow: "hidden",
              }}
            >
              {dragOver && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(61,129,227,0.04)", borderRadius: "var(--radius-xl)" }} />
              )}
              <div style={{ fontSize: "2.8rem", marginBottom: "14px", filter: uploading ? "grayscale(1)" : "none", transition: "filter 0.3s" }}>
                {uploading ? "⏳" : dragOver ? "📂" : "📎"}
              </div>
              <p style={{ fontSize: "0.95rem", color: uploading ? "var(--text-4)" : "white", margin: "0 0 6px", fontWeight: 600 }}>
                {uploading ? "Uploading and parsing your bid…" : dragOver ? "Drop to upload" : "Drop your pricing file here"}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-4)", margin: "0 0 24px", lineHeight: 1.5 }}>
                Excel · CSV · PDF · Word · auto-detects Part Number and Unit Price columns
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
              <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                disabled={!selectedRound || uploading} className="btn-brand" style={{ padding: "10px 28px", fontSize: "0.88rem" }}>
                {uploading ? "Uploading…" : "Choose File"}
              </button>
              {!selectedRound && (
                <p style={{ fontSize: "0.72rem", color: "var(--text-4)", marginTop: "12px", margin: "12px 0 0" }}>Select a round above first</p>
              )}
            </div>

            {/* Success */}
            {msg && (
              <div style={{ padding: "14px 18px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "var(--radius)", fontSize: "0.83rem", color: "#34d399", lineHeight: 1.6 }}>
                ✓ <span dangerouslySetInnerHTML={{ __html: msg }} />
              </div>
            )}
            {/* Error */}
            {error && (
              <div style={{ padding: "14px 18px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius)", fontSize: "0.83rem", color: "#f87171" }}>
                {error}
              </div>
            )}

            {/* Tips */}
            <div style={{ background: "rgba(61,129,227,0.05)", border: "1px solid rgba(61,129,227,0.12)", borderRadius: "var(--radius-lg)", padding: "20px 22px" }}>
              <p style={{ fontWeight: 700, color: "var(--text-2)", margin: "0 0 12px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "7px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Submission Tips
              </p>
              <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--text-4)", fontSize: "0.78rem", lineHeight: 1.8 }}>
                <li>Download the bid template and fill in the <strong style={{ color: "var(--text-3)" }}>Unit Price</strong> column only</li>
                <li>Leave blank any lines you don't wish to bid on — zero means you opt out</li>
                <li>You can resubmit before the deadline; we'll use your latest file</li>
                <li>Or email your file to <strong style={{ color: "#60a5fa" }}>bids@thinktls.com</strong> with the round number in the subject</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </BuyerLayout>
  );
}

export default function SubmitBid() {
  return (
    <Suspense fallback={<BuyerLayout><div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}><div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div></BuyerLayout>}>
      <SubmitBidInner />
    </Suspense>
  );
}
