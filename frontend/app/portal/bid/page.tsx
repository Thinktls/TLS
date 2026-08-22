"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { fmtDatetime } from "@/lib/format";

interface Round {
  id: number; name: string; commodity: string;
  customer: string | null; deadline: string | null;
  invite_status: string | null; assigned: boolean;
  notes: string | null;
}

interface PreviewRow {
  raw_part_number: string; description: string;
  unit_price: number | null; quantity: number;
  category?: string | null;
  extra_columns?: Record<string, string> | null;
}

interface Preview {
  filename: string; total_lines: number; total_quantity: number;
  rows: PreviewRow[];
}

interface MasterItem {
  id: number; row_number: number; part_number: string;
  description: string; manufacturer: string; quantity: number; category: string;
}

function SubmitBidInner() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("round");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(preselect ? Number(preselect) : null);
  const [mode, setMode] = useState<"upload" | "inline">("upload");
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hasSubmission, setHasSubmission] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Inline form state
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [inlinePrices, setInlinePrices] = useState<Record<number, string>>({});
  const [loadingItems, setLoadingItems] = useState(false);
  const [inlineDone, setInlineDone] = useState(false);
  const [offerTerms, setOfferTerms] = useState("");

  useEffect(() => {
    api.get("/buyer/rounds").then(r => {
      setRounds(r.data);
    });
  }, []);

  useEffect(() => {
    if (selectedRound) {
      api.get(`/buyer/rounds/${selectedRound}/my-submission`)
        .then(r => setHasSubmission(!!r.data.bid_file))
        .catch(() => setHasSubmission(false));
      setStep("upload");
      setPreview(null);
      setSelectedFile(null);
      setMsg(""); setError("");
      setInlineDone(false);
      setInlinePrices({});
    }
  }, [selectedRound]);

  useEffect(() => {
    if (mode === "inline" && selectedRound && masterItems.length === 0) {
      setLoadingItems(true);
      api.get(`/buyer/rounds/${selectedRound}/items`)
        .then(r => setMasterItems(r.data))
        .catch(() => setError("Could not load items for this round."))
        .finally(() => setLoadingItems(false));
    }
  }, [mode, selectedRound]);

  async function handleFile(file: File) {
    if (!selectedRound) return;
    setUploading(true); setError(""); setSelectedFile(file);
    const fd = new FormData();
    fd.append("file", file);
    try {
      // Big workbooks need well over the default client timeout to parse on the shared-CPU host.
      const res = await api.post(`/buyer/rounds/${selectedRound}/parse-preview`, fd, { timeout: 180000 });
      setPreview(res.data);
      setStep("preview");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail) setError(detail);
      else if (err.code === "ECONNABORTED") setError("Timed out while the server was reading this file. Large files can take a minute — please try again.");
      else if (!err.response) setError("Cannot reach the server. Check your connection and try again.");
      else setError("Could not parse file. Try downloading the Bid Template and filling in prices.");
      setSelectedFile(null);
    } finally { setUploading(false); }
  }

  async function confirmSubmit() {
    if (!selectedRound || !selectedFile) return;
    setSubmitting(true); setError("");
    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("offer_terms", offerTerms);
    try {
      const res = await api.post(`/buyer/rounds/${selectedRound}/bid`, fd, { timeout: 180000 });
      setMsg(`${res.data.message || "Bid submitted!"} — <a href="/portal/submission?round=${selectedRound}" style="color:var(--success);font-weight:600">View full submission →</a>`);
      setStep("done");
      setHasSubmission(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail) setError(detail);
      else if (err.code === "ECONNABORTED") setError("Timed out while the server was processing your bid. Large files can take a minute — please try again.");
      else if (!err.response) setError("Cannot reach the server. Check your connection and try again.");
      else setError("Submission failed. Please try again.");
    } finally { setSubmitting(false); }
  }

  async function submitInline() {
    if (!selectedRound) return;
    const lines = masterItems
      .filter(item => inlinePrices[item.id] && parseFloat(inlinePrices[item.id]) > 0)
      .map(item => ({
        master_item_id: item.id,
        part_number: item.part_number,
        description: item.description,
        unit_price: parseFloat(inlinePrices[item.id]),
        quantity: item.quantity,  // qty is locked to the model quantity — buyers price, they don't set qty
      }));
    if (lines.length === 0) {
      setError("Enter at least one price before submitting.");
      return;
    }
    setSubmitting(true); setError("");
    try {
      const res = await api.post(`/buyer/rounds/${selectedRound}/bid-inline`, { lines, offer_terms: offerTerms });
      setMsg(`${res.data.message || "Bid submitted!"} — <a href="/portal/submission?round=${selectedRound}" style="color:var(--success);font-weight:600">View full submission →</a>`);
      setInlineDone(true);
      setHasSubmission(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Submission failed.");
    } finally { setSubmitting(false); }
  }

  const round = rounds.find(r => r.id === selectedRound);
  const pricedCount = Object.values(inlinePrices).filter(v => v && parseFloat(v) > 0).length;

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "860px" }} className="animate-in">

        {/* Header */}
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px", lineHeight: 1.3 }}>Submit a Bid</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Choose a round, then upload your priced file or enter prices directly on-screen.</p>
        </div>

        {/* How it works */}
        <div style={{ display: "flex", gap: "0", marginBottom: "20px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          {[
            { n: "1", title: "Select a Round", body: "Choose the active bid round you were invited to." },
            { n: "2", title: "Get Your Template", body: "Download the pre-filled Excel file with all items to price." },
            { n: "3", title: "Upload & Submit", body: "Fill in your prices and upload the file — or enter prices on-screen." },
          ].map(({ n, title, body }, i) => (
            <div key={n} style={{ flex: 1, padding: "14px 18px", borderRight: i < 2 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--brand-dim)", color: "var(--info)", fontSize: "0.7rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)" }}>{title}</span>
              </div>
              <p style={{ fontSize: "0.71rem", color: "var(--text-4)", margin: 0, lineHeight: 1.45, paddingLeft: "28px" }}>{body}</p>
            </div>
          ))}
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
                <div style={{ marginTop: "14px", padding: "12px 14px", background: "var(--brand-dim)", border: "1px solid var(--brand-dim)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      {round.deadline && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--warning)" }} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span style={{ fontSize: "0.75rem", color: "var(--warning)", fontWeight: 500 }}>Deadline: {fmtDatetime(round.deadline)}</span>
                        </div>
                      )}
                      {round.customer && <p style={{ fontSize: "0.73rem", color: "var(--text-4)", margin: 0 }}>Customer: {round.customer}</p>}
                       {round.notes && (
                         <div style={{ marginTop: 12, padding: 12, background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border-2)" }}>
                           <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-2)", fontWeight: 500 }}>Notes from Admin:</p>
                           <p style={{ margin: "8px 0 0", fontSize: "0.8rem", color: "var(--text-3)", whiteSpace: "pre-wrap" }}>
                             {round.notes}
                           </p>
                         </div>
                       )}
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => downloadFile(`/buyer/rounds/${selectedRound}/template`, `bid_file_round_${selectedRound}.xlsx`)}
                        className="btn-brand"
                        style={{ fontSize: "0.75rem", padding: "6px 16px" }}
                        title="Download the Excel bid template — fill in your prices and upload it back">
                        ↓ Download Bid Template
                      </button>
                      {hasSubmission && (
                        <button onClick={() => downloadFile(`/buyer/rounds/${selectedRound}/my-submission/download`, `my_bid_round_${selectedRound}.xlsx`)}
                          className="btn-ghost" style={{ fontSize: "0.75rem", padding: "6px 14px" }}>
                          ↓ My Submitted Bid
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mode switcher */}
            {selectedRound && (
              <div style={{ display: "flex", gap: "8px" }}>
                {(["upload", "inline"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(""); }}
                    style={{
                      padding: "8px 18px", borderRadius: "var(--radius)", fontSize: "0.82rem", fontWeight: 600,
                      border: mode === m ? "1px solid var(--brand)" : "1px solid var(--border)",
                      background: mode === m ? "var(--brand-dim)" : "var(--bg-2)",
                      color: mode === m ? "var(--brand)" : "var(--text-3)",
                      cursor: "pointer", transition: "all 0.15s",
                    }}>
                    {m === "upload" ? "📎 Upload File" : "✏️ Enter Prices Online"}
                  </button>
                ))}
              </div>
            )}

            {/* ── Upload mode ── */}
            {mode === "upload" && (
              <>
                {step === "upload" && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                    onClick={() => selectedRound && !uploading && fileRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "var(--brand-glow)" : selectedRound ? "var(--border-mid)" : "var(--border)"}`,
                      borderRadius: "var(--radius-xl)", padding: "56px 32px", textAlign: "center",
                      cursor: selectedRound && !uploading ? "pointer" : "default",
                      background: dragOver ? "var(--brand-dim)" : "var(--bg-2)",
                      transition: "all 0.2s", position: "relative", overflow: "hidden",
                    }}
                  >
                    <div style={{ fontSize: "2.8rem", marginBottom: "14px", filter: uploading ? "grayscale(1)" : "none" }}>
                      {uploading ? "⏳" : dragOver ? "📂" : "📎"}
                    </div>
                    <p style={{ fontSize: "0.95rem", color: uploading ? "var(--text-4)" : "var(--text-1)", margin: "0 0 6px", fontWeight: 600 }}>
                      {uploading ? "Parsing your file…" : dragOver ? "Drop to upload" : "Drop your pricing file here"}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-4)", margin: "0 0 24px", lineHeight: 1.5 }}>
                      Excel · CSV · PDF · Word · AI-powered parsing — any format accepted
                    </p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                    <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                      disabled={!selectedRound || uploading} className="btn-brand" style={{ padding: "10px 28px", fontSize: "0.88rem" }}>
                      {uploading ? "Parsing…" : "Choose File"}
                    </button>
                    {!selectedRound && (
                      <p style={{ fontSize: "0.72rem", color: "var(--text-4)", marginTop: "12px", margin: "12px 0 0" }}>Select a round above first</p>
                    )}
                  </div>
                )}

                {step === "preview" && preview && (
                  <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
                    <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: "0 0 2px", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)" }}>Review Before Submitting</p>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-4)" }}>
                          {preview.filename} — <strong style={{ color: "var(--text-2)" }}>{preview.total_lines} lines</strong>, <strong style={{ color: "var(--text-2)" }}>{preview.total_quantity.toLocaleString()} units</strong>
                        </p>
                      </div>
                      <button onClick={() => { setStep("upload"); setPreview(null); setSelectedFile(null); fileRef.current && (fileRef.current.value = ""); }}
                        className="btn-ghost" style={{ fontSize: "0.75rem", padding: "6px 14px" }}>
                        ← Re-upload
                      </button>
                    </div>
                    {(() => {
                      // Build dynamic column list from actual data
                      const hasCategory = preview.rows.some(r => r.category);
                      const extraKeys = Array.from(new Set(
                        preview.rows.flatMap(r => Object.keys(r.extra_columns ?? {}))
                      ));
                      const thStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-4)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
                      return (
                        <div style={{ overflowX: "auto", maxHeight: "480px", overflowY: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                            <thead>
                              <tr style={{ position: "sticky", top: 0, background: "var(--bg-2)", zIndex: 1 }}>
                                <th style={thStyle}>#</th>
                                <th style={thStyle}>Part Number</th>
                                <th style={thStyle}>Description</th>
                                {hasCategory && <th style={thStyle}>Grade</th>}
                                <th style={thStyle}>Unit Price</th>
                                <th style={thStyle}>Qty</th>
                                {extraKeys.map(k => <th key={k} style={thStyle}>{k}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.rows.map((row, i) => (
                                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                  <td style={{ padding: "7px 12px", color: "var(--text-4)", fontSize: "0.72rem", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                                  <td style={{ padding: "7px 12px", color: "var(--info)", fontFamily: "monospace", fontSize: "0.77rem", whiteSpace: "nowrap" }}>{row.raw_part_number}</td>
                                  <td style={{ padding: "7px 12px", color: "var(--text-3)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description || "—"}</td>
                                  {hasCategory && <td style={{ padding: "7px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>{row.category || "—"}</td>}
                                  <td style={{ padding: "7px 12px", color: row.unit_price ? "var(--success)" : "var(--text-4)", whiteSpace: "nowrap" }}>
                                    {row.unit_price != null ? `$${row.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                  </td>
                                  <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>{row.quantity}</td>
                                  {extraKeys.map(k => (
                                    <td key={k} style={{ padding: "7px 12px", color: "var(--text-3)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {row.extra_columns?.[k] || "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                    <TermsField value={offerTerms} onChange={setOfferTerms} />
                    <div style={{ padding: "16px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: "10px", alignItems: "center" }}>
                      <button onClick={confirmSubmit} disabled={submitting} className="btn-brand" style={{ padding: "10px 28px", fontSize: "0.9rem", fontWeight: 700 }}>
                        {submitting ? "Submitting…" : `Confirm & Submit ${preview.total_lines} lines`}
                      </button>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-4)" }}>{preview.total_quantity.toLocaleString()} units across {preview.total_lines} part numbers</span>
                    </div>
                  </div>
                )}

                {step === "done" && msg && (
                  <div style={{ padding: "14px 18px", background: "var(--success-dim)", border: "1px solid var(--success-dim)", borderRadius: "var(--radius)", fontSize: "0.83rem", color: "var(--success)", lineHeight: 1.6 }}>
                    ✓ <span dangerouslySetInnerHTML={{ __html: msg }} />
                  </div>
                )}
                {step === "done" && (
                  <button onClick={() => { setStep("upload"); setPreview(null); setSelectedFile(null); setMsg(""); fileRef.current && (fileRef.current.value = ""); }}
                    className="btn-ghost" style={{ fontSize: "0.8rem", alignSelf: "flex-start" }}>
                    Submit another file
                  </button>
                )}

                {step === "upload" && (
                  <div style={{ background: "var(--brand-dim)", border: "1px solid var(--brand-dim)", borderRadius: "var(--radius-lg)", padding: "20px 22px" }}>
                    <p style={{ fontWeight: 700, color: "var(--text-2)", margin: "0 0 12px", fontSize: "0.82rem" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2" style={{ marginRight: "7px", verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Submission Tips
                    </p>
                    <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--text-4)", fontSize: "0.78rem", lineHeight: 1.8 }}>
                      <li>Download the <strong style={{ color: "var(--text-3)" }}>Bid File</strong> and fill in the Unit Price column only</li>
                      <li>Or switch to <strong style={{ color: "var(--text-3)" }}>Enter Prices Online</strong> to type prices directly — no Excel needed</li>
                      <li>Upload any file format — AI will detect your columns automatically</li>
                      <li>You can resubmit before the deadline; we use your latest submission</li>
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* ── Inline mode ── */}
            {mode === "inline" && selectedRound && (
              <>
                {inlineDone ? (
                  <>
                    <div style={{ padding: "14px 18px", background: "var(--success-dim)", border: "1px solid var(--success-dim)", borderRadius: "var(--radius)", fontSize: "0.83rem", color: "var(--success)", lineHeight: 1.6 }}>
                      ✓ <span dangerouslySetInnerHTML={{ __html: msg }} />
                    </div>
                    <button onClick={() => { setInlineDone(false); setInlinePrices({}); setMsg(""); }}
                      className="btn-ghost" style={{ fontSize: "0.8rem", alignSelf: "flex-start" }}>
                      Edit prices
                    </button>
                  </>
                ) : loadingItems ? (
                  <div style={{ padding: "48px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>Loading items…</div>
                ) : masterItems.length === 0 ? (
                  <div style={{ padding: "48px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>No items found for this round.</div>
                ) : (
                  <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
                    {/* Header bar */}
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <p style={{ margin: "0 0 2px", fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)" }}>Enter Your Prices</p>
                        <p style={{ margin: 0, fontSize: "0.73rem", color: "var(--text-4)" }}>
                          {masterItems.length} items — {pricedCount} priced so far
                        </p>
                      </div>
                      <button onClick={submitInline} disabled={submitting || pricedCount === 0} className="btn-brand" style={{ padding: "9px 24px", fontSize: "0.85rem", fontWeight: 700, opacity: pricedCount === 0 ? 0.5 : 1 }}>
                        {submitting ? "Submitting…" : `Submit ${pricedCount} Priced Line${pricedCount !== 1 ? "s" : ""}`}
                      </button>
                    </div>

                    {/* Items table */}
                    <div style={{ overflowX: "auto", maxHeight: "520px", overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                        <thead>
                          <tr style={{ position: "sticky", top: 0, background: "var(--bg-2)", zIndex: 1 }}>
                            {["#", "Part Number", "Description", "Qty", "Your Price ($)"].map(h => (
                              <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-4)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {masterItems.map((item, idx) => {
                            const priced = inlinePrices[item.id] && parseFloat(inlinePrices[item.id]) > 0;
                            return (
                              <tr key={item.id} style={{ borderBottom: "1px solid var(--border)", background: priced ? "var(--success-dim)" : "transparent", transition: "background 0.15s" }}>
                                <td style={{ padding: "7px 12px", color: "var(--text-4)", fontSize: "0.72rem", fontVariantNumeric: "tabular-nums" }}>{idx + 1}</td>
                                <td style={{ padding: "7px 12px", color: "var(--info)", fontFamily: "monospace", fontSize: "0.77rem", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.part_number}</td>
                                <td style={{ padding: "7px 12px", color: "var(--text-3)", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.description}>{item.description || item.manufacturer || "—"}</td>
                                <td style={{ padding: "7px 12px", color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{item.quantity}</td>
                                <td style={{ padding: "4px 8px" }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={inlinePrices[item.id] ?? ""}
                                    onChange={e => setInlinePrices(p => ({ ...p, [item.id]: e.target.value }))}
                                    style={{
                                      width: "110px", padding: "5px 8px", borderRadius: "6px",
                                      border: priced ? "1px solid var(--success-strong)" : "1px solid var(--border)",
                                      background: "var(--bg)", color: priced ? "var(--success)" : "var(--text-1)",
                                      fontSize: "0.82rem", outline: "none", fontVariantNumeric: "tabular-nums",
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <TermsField value={offerTerms} onChange={setOfferTerms} />

                    {/* Footer submit */}
                    <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-4)" }}>Leave price blank to opt out of a line</span>
                      <button onClick={submitInline} disabled={submitting || pricedCount === 0} className="btn-brand" style={{ padding: "9px 24px", fontSize: "0.85rem", fontWeight: 700, opacity: pricedCount === 0 ? 0.5 : 1 }}>
                        {submitting ? "Submitting…" : `Submit ${pricedCount} Priced Line${pricedCount !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: "14px 18px", background: "var(--danger-dim)", border: "1px solid var(--danger-dim)", borderRadius: "var(--radius)", fontSize: "0.83rem", color: "var(--danger)" }}>
                {error}
              </div>
            )}

          </div>
        )}
      </div>
    </BuyerLayout>
  );
}

function TermsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)" }}>
      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-2)", marginBottom: "6px" }}>
        Offer terms / conditions <span style={{ color: "var(--text-4)", fontWeight: 400 }}>(optional)</span>
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        placeholder='e.g. "Will not accept an award lower than $20K." · "All SSDs must be above 90% health."'
        style={{
          width: "100%", padding: "9px 12px", borderRadius: "8px", resize: "vertical",
          border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-1)",
          fontSize: "0.82rem", outline: "none", fontFamily: "inherit", lineHeight: 1.5,
        }}
      />
      <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: "6px 0 0" }}>
        Any conditions on your offer. ThinkTLS reviews these with your bid.
      </p>
    </div>
  );
}

export default function SubmitBid() {
  return (
    <Suspense fallback={<BuyerLayout><div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}><div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div></BuyerLayout>}>
      <SubmitBidInner />
    </Suspense>
  );
}
