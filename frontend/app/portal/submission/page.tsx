"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";
import Link from "next/link";

interface BidFileMeta {
  id: number; filename: string; uploaded_at: string | null;
  lines_parsed: number; status: string; error_message: string | null;
}
interface SubmittedLine {
  id: number; row_number: number | null; raw_part_number: string;
  description: string | null; unit_price: number | null; quantity: number | null;
  match_status: string; match_method: string | null; exception_type: string | null;
  matched_part_number: string | null; matched_description: string | null;
}
interface RoundRow { id: number; name: string; status: string; lines_submitted: number; }

function SubmissionInner() {
  const params = useSearchParams();
  const paramRound = params.get("round");
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(paramRound ? Number(paramRound) : null);
  const [bidFile, setBidFile] = useState<BidFileMeta | null>(null);
  const [lines, setLines] = useState<SubmittedLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "matched" | "exception">("all");

  useEffect(() => {
    api.get("/buyer/my-rounds").then(r => {
      const submitted = r.data.filter((row: RoundRow) => row.lines_submitted > 0);
      setRounds(submitted);
      if (!selectedRound && submitted.length === 1) {
        setSelectedRound(submitted[0].id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRound) { setBidFile(null); setLines([]); return; }
    setLoading(true);
    api.get(`/buyer/rounds/${selectedRound}/my-submission`)
      .then(r => { setBidFile(r.data.bid_file); setLines(r.data.lines); })
      .catch(() => { setBidFile(null); setLines([]); })
      .finally(() => setLoading(false));
  }, [selectedRound]);

  const filtered = lines.filter(l => filter === "all" || l.match_status === filter);
  const matchedCount = lines.filter(l => l.match_status === "matched").length;
  const exceptionCount = lines.filter(l => l.match_status === "exception").length;
  const matchRate = lines.length > 0 ? ((matchedCount / lines.length) * 100).toFixed(0) : null;

  if (loading) return (
    <BuyerLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </BuyerLayout>
  );

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "1060px" }} className="animate-in">

        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>My Submission</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Review your parsed bid lines and match status.</p>
        </div>

        {/* Round selector */}
        {rounds.length > 0 && (
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "18px 22px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Round</label>
            <select value={selectedRound ?? ""} onChange={e => { setSelectedRound(Number(e.target.value)); setFilter("all"); }} className="glass-input" style={{ flex: 1, minWidth: "200px" }}>
              <option value="">— Select a round —</option>
              {rounds.map(r => <option key={r.id} value={r.id}>{r.name} ({r.lines_submitted} lines)</option>)}
            </select>
            {selectedRound && (
              <button onClick={() => downloadFile(`/buyer/rounds/${selectedRound}/my-submission/download`, `my_bid_round_${selectedRound}.xlsx`)}
                className="btn-ghost" style={{ fontSize: "0.78rem", padding: "7px 16px", flexShrink: 0 }}>
                ↓ Download My Bid
              </button>
            )}
          </div>
        )}

        {rounds.length === 0 && (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "72px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>📭</div>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>No submissions yet</p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: "0 0 20px" }}>Submit a bid file to see your parsed lines here.</p>
            <Link href="/portal/bid" className="btn-brand" style={{ textDecoration: "none" }}>Submit a Bid</Link>
          </div>
        )}

        {rounds.length > 0 && !selectedRound && (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "64px", textAlign: "center" }}>
            <p style={{ fontSize: "0.88rem", color: "var(--text-4)" }}>Select a round above to view your submission.</p>
          </div>
        )}

        {selectedRound && !bidFile && !loading && (
          <div style={{ textAlign: "center", paddingTop: "40px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>📭</div>
            <p style={{ color: "var(--text-4)", marginBottom: "20px", fontSize: "0.9rem" }}>No submission found for this round.</p>
            <Link href={`/portal/bid?round=${selectedRound}`} className="btn-brand" style={{ textDecoration: "none" }}>Submit a Bid</Link>
          </div>
        )}

        {bidFile && (
          <>
            {/* File info */}
            <div style={{ marginBottom: "16px", fontSize: "0.75rem", color: "var(--text-4)" }}>
              {bidFile.filename}
              {bidFile.uploaded_at && ` · Uploaded ${new Date(bidFile.uploaded_at).toLocaleString()}`}
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
              {[
                { label: "Total Lines", val: lines.length, color: "var(--text-1)", bg: "rgba(255,255,255,0.03)", border: "var(--border)" },
                { label: "Matched",     val: matchedCount, color: "#34d399", bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.2)" },
                { label: "Exceptions",  val: exceptionCount, color: exceptionCount > 0 ? "#fb923c" : "var(--text-3)", bg: exceptionCount > 0 ? "rgba(251,146,60,0.07)" : "rgba(255,255,255,0.03)", border: exceptionCount > 0 ? "rgba(251,146,60,0.2)" : "var(--border)" },
                { label: "Match Rate",  val: matchRate ? `${matchRate}%` : "—", color: matchRate && Number(matchRate) >= 80 ? "#34d399" : "#fbbf24", bg: "rgba(255,255,255,0.03)", border: "var(--border)" },
              ].map(({ label, val, color, bg, border }) => (
                <div key={label} style={{ padding: "14px 20px", background: bg, border: `1px solid ${border}`, borderRadius: "var(--radius-lg)" }}>
                  <p style={{ fontSize: "0.65rem", color: "var(--text-4)", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{label}</p>
                  <p style={{ fontSize: "1.45rem", fontWeight: 800, color, margin: 0, letterSpacing: "-0.03em" }}>{val}</p>
                </div>
              ))}
              <div style={{ padding: "14px 20px", background: bidFile.status === "processed" ? "rgba(52,211,153,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${bidFile.status === "processed" ? "rgba(52,211,153,0.2)" : "rgba(239,68,68,0.2)"}`, borderRadius: "var(--radius-lg)" }}>
                <p style={{ fontSize: "0.65rem", color: "var(--text-4)", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>File Status</p>
                <p style={{ fontSize: "1rem", fontWeight: 700, color: bidFile.status === "processed" ? "#34d399" : "#f87171", margin: 0, textTransform: "capitalize" }}>{bidFile.status}</p>
              </div>
            </div>

            {/* Alerts */}
            {bidFile.error_message && (
              <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: "0.83rem" }}>
                <strong>Parse error:</strong> {bidFile.error_message}
              </div>
            )}
            {exceptionCount > 0 && (
              <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.18)", color: "#fb923c", fontSize: "0.83rem", display: "flex", gap: "10px", alignItems: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{exceptionCount} line{exceptionCount > 1 ? "s" : ""} could not be automatically matched to the catalog. The admin will review these — no action needed from you.</span>
              </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: "4px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px", width: "fit-content", marginBottom: "16px" }}>
              {(["all", "matched", "exception"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "5px 14px", borderRadius: "7px", fontSize: "0.78rem", cursor: "pointer", border: "none",
                  background: filter === f ? "rgba(61,129,227,0.18)" : "transparent",
                  color: filter === f ? "white" : "var(--text-4)",
                  fontWeight: filter === f ? 600 : 400, transition: "all 0.15s", fontFamily: "inherit",
                }}>
                  {f === "all" ? `All (${lines.length})` : f === "matched" ? `Matched (${matchedCount})` : `Exceptions (${exceptionCount})`}
                </button>
              ))}
            </div>

            {/* Table */}
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden", overflowX: "auto" }}>
              <table className="dark-table" style={{ minWidth: "720px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "36px" }}>#</th>
                    <th>Your Part Number</th>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th>Status</th>
                    <th>Matched To</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} style={{ background: l.match_status === "matched" ? "rgba(16,185,129,0.02)" : l.match_status === "exception" ? "rgba(251,146,60,0.02)" : "transparent" }}>
                      <td style={{ color: "var(--text-4)", fontSize: "0.72rem" }}>{l.row_number ?? "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: l.match_status === "matched" ? "#34d399" : "white" }}>{l.raw_part_number}</td>
                      <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.78rem", color: "var(--text-3)" }}>
                        {l.description || "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {l.unit_price != null ? `$${l.unit_price.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontSize: "0.8rem", color: "var(--text-3)" }}>{l.quantity ?? "—"}</td>
                      <td>
                        <span className={`badge ${l.match_status === "matched" ? "badge-matched" : l.match_status === "exception" ? "badge-exception" : "badge-draft"}`}>
                          {l.match_status === "exception" && l.exception_type
                            ? l.exception_type.replace(/_/g, " ")
                            : l.match_status}
                          {l.match_method ? ` · ${l.match_method}` : ""}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.75rem" }}>
                        {l.matched_part_number ? (
                          <div>
                            <div style={{ fontFamily: "monospace", color: "#34d399", fontSize: "0.78rem" }}>{l.matched_part_number}</div>
                            {l.matched_description && <div style={{ color: "var(--text-4)", fontSize: "0.7rem", marginTop: "1px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.matched_description}</div>}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-4)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>
                  No lines match this filter.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </BuyerLayout>
  );
}

export default function SubmissionPage() {
  return (
    <Suspense fallback={
      <BuyerLayout>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </BuyerLayout>
    }>
      <SubmissionInner />
    </Suspense>
  );
}
