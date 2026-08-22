"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";
import Link from "next/link";
import { fmtDatetime } from "@/lib/format";

interface BuyerInfo {
  id: number;
  full_name: string;
  email: string;
  company_name: string;
  is_active: boolean;
  fluff_percentage: number;
  win_rate: number;
  total_lines_won: number;
  total_lines_bid: number;
  buyer_score: number;
}

interface BidFileMeta {
  id: number;
  filename: string;
  uploaded_at: string | null;
  lines_parsed: number;
  status: string;
  has_file: boolean;
}

interface BidLine {
  id: number;
  raw_part_number: string;
  description: string | null;
  unit_price: number | null;
  quantity: number | null;
  match_status: string;
  match_method: string | null;
  exception_type: string | null;
  is_winner: boolean;
  is_anomaly: boolean;
  buyer_name: string | null;
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function BuyerRoundBidsPage() {
  const { id: roundId, buyerId } = useParams();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [bidFile, setBidFile] = useState<BidFileMeta | null>(null);
  const [lines, setLines] = useState<BidLine[]>([]);
  const [roundName, setRoundName] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "matched" | "exception" | "winner">("all");

  useEffect(() => {
    Promise.all([
      api.get(`/auth/buyers/${buyerId}/profile`).then(r => r.data).catch(() => null),
      api.get(`/rounds/${roundId}/bid-files`).then(r => r.data).catch(() => []),
      api.get(`/rounds/${roundId}/bid-lines`, { params: { buyer_id: buyerId, limit: 500 } }).then(r => r.data).catch(() => ({ items: [] })),
      api.get(`/rounds/${roundId}`).then(r => r.data.name).catch(() => ""),
    ]).then(([b, files, linesData, name]) => {
      setBuyer(b);
      setRoundName(name);
      // Find this buyer's file
      const myFile = (files as any[]).find((f: any) => f.buyer_id === Number(buyerId));
      if (myFile) setBidFile(myFile);
      setLines(linesData.items || []);
    }).finally(() => setLoading(false));
  }, [roundId, buyerId]);

  const filtered = lines.filter(l => {
    if (filter === "all") return true;
    if (filter === "matched") return l.match_status === "matched";
    if (filter === "exception") return l.match_status === "exception";
    if (filter === "winner") return l.is_winner;
    return true;
  });

  const matchedCount = lines.filter(l => l.match_status === "matched").length;
  const exceptionCount = lines.filter(l => l.match_status === "exception").length;
  const winnerCount = lines.filter(l => l.is_winner).length;
  const winRate = matchedCount > 0 ? ((winnerCount / matchedCount) * 100).toFixed(0) : null;

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--info-border)", borderTopColor: "var(--info)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (!buyer) return (
    <AdminLayout>
      <div style={{ textAlign: "center", paddingTop: "80px", color: "var(--danger)" }}>Buyer not found.</div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="page-shell animate-in">

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", fontSize: "0.78rem", color: "var(--text-4)" }}>
          <Link href="/admin/rounds" style={{ color: "var(--text-4)", textDecoration: "none" }}>Rounds</Link>
          <span>›</span>
          <Link href={`/admin/rounds/${roundId}`} style={{ color: "var(--text-4)", textDecoration: "none" }}>{roundName || `Round #${roundId}`}</Link>
          <span>›</span>
          <span style={{ color: "var(--text-2)" }}>{buyer.company_name || buyer.full_name}</span>
        </div>

        {/* Header */}
        <div className="page-header">
          <div className="page-header-text">
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "linear-gradient(135deg,var(--info-bg),var(--violet-bright-bg))", border: "1px solid var(--info-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "var(--info)", flexShrink: 0 }}>
              {initials(buyer.full_name)}
            </div>
            <div>
              <h1 className="page-title" style={{ margin: "0 0 3px" }}>{buyer.full_name}</h1>
              <p className="page-subtitle">
                {buyer.company_name && <span style={{ color: "var(--text-3)" }}>{buyer.company_name} · </span>}
                {buyer.email}
              </p>
            </div>
          </div>
          </div>
          <Link href={`/admin/buyers/${buyerId}`} className="btn-ghost" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
            View Full Profile →
          </Link>
        </div>

        {/* Stats row */}
        <div className="kpi-grid" style={{ marginBottom: "20px" }}>
          {[
            { label: "Lines Submitted", val: lines.length,     color: "var(--text-1)",   bg: "var(--surface)", border: "var(--border)" },
            { label: "Matched",         val: matchedCount,     color: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
            { label: "Exceptions",      val: exceptionCount,   color: exceptionCount > 0 ? "var(--orange)" : "var(--text-3)", bg: exceptionCount > 0 ? "var(--orange-bg)" : "var(--surface)", border: exceptionCount > 0 ? "var(--orange-border)" : "var(--border)" },
            { label: "Lines Won",       val: winnerCount,      color: "var(--violet-bright)", bg: "var(--violet-bright-bg)", border: "var(--violet-bright-border)" },
          ].map(({ label, val, color, bg, border }) => (
            <div key={label} style={{ padding: "14px 18px", background: bg, border: `1px solid ${border}`, borderRadius: "var(--radius-lg)" }}>
              <p style={{ fontSize: "0.65rem", color: "var(--text-4)", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{label}</p>
              <p style={{ fontSize: "1.45rem", fontWeight: 800, color, margin: 0, letterSpacing: "-0.03em" }}>{val}</p>
            </div>
          ))}
        </div>

        {/* Bid file card */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "20px 22px", marginBottom: "16px" }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 14px" }}>Submitted File</p>
          {!bidFile ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-4)", margin: 0 }}>No file submitted for this round yet.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "9px", background: "var(--info-bg)", border: "1px solid var(--info-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-1)", margin: "0 0 3px", fontFamily: "monospace" }}>{bidFile.filename}</p>
                  <p style={{ fontSize: "0.73rem", color: "var(--text-4)", margin: 0 }}>
                    {bidFile.lines_parsed} lines parsed
                    {bidFile.uploaded_at && ` · Uploaded ${fmtDatetime(bidFile.uploaded_at)}`}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className={`badge ${bidFile.status === "processed" ? "badge-complete" : "badge-error"}`}>{bidFile.status}</span>
                {bidFile.has_file ? (
                  <button onClick={() => downloadFile(`/rounds/${roundId}/bid-files/${bidFile.id}/download`, bidFile.filename)} className="btn-ghost" style={{ fontSize: "0.78rem", padding: "6px 14px" }}>
                    ↓ Download Original
                  </button>
                ) : (
                  <button onClick={() => downloadFile(`/rounds/${roundId}/bid-files/${bidFile.id}/reconstruct`, bidFile.filename.replace(/\.[^.]+$/, "_reconstructed.xlsx"))} className="btn-ghost" style={{ fontSize: "0.78rem", padding: "6px 14px", borderColor: "var(--warning-border)", color: "var(--warning)" }} title="Original file no longer on disk — downloads a reconstruction from the parsed bid line data">
                    ↓ Download (Reconstructed)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bid lines */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Bid Lines</p>
            {winRate && <span style={{ fontSize: "0.78rem", color: "var(--text-4)" }}>Win rate: <strong style={{ color: "var(--violet-bright)" }}>{winRate}%</strong></span>}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: "4px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px", width: "fit-content", marginBottom: "14px" }}>
            {([
              { key: "all",       label: `All (${lines.length})` },
              { key: "matched",   label: `Matched (${matchedCount})` },
              { key: "winner",    label: `Won (${winnerCount})` },
              { key: "exception", label: `Exceptions (${exceptionCount})` },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding: "5px 13px", borderRadius: "7px", fontSize: "0.78rem", cursor: "pointer", border: "none", fontFamily: "inherit",
                background: filter === key ? "var(--info-bg)" : "transparent",
                color: filter === key ? "var(--text-1)" : "var(--text-4)",
                fontWeight: filter === key ? 600 : 400, transition: "all 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>

          <div className="panel" style={{ overflowX: "auto" }}>
            <table className="dark-table" style={{ minWidth: "700px" }}>
              <thead>
                <tr>
                  <th>Part Number (Submitted)</th>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Winner</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(line => (
                  <tr key={line.id} style={{ background: line.is_winner ? "var(--success-bg)" : line.match_status === "exception" ? "var(--orange-bg)" : "transparent" }}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: line.is_winner ? "var(--success)" : line.match_status === "exception" ? "var(--orange)" : "var(--text-1)" }}>
                      {line.raw_part_number}
                    </td>
                    <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.78rem", color: "var(--text-3)" }}>
                      {line.description || "—"}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: "0.82rem", fontWeight: line.is_winner ? 700 : 400, color: line.is_winner ? "var(--success)" : "var(--text-2)" }}>
                      {line.unit_price != null ? `$${line.unit_price.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--text-3)", fontSize: "0.82rem" }}>{line.quantity ?? "—"}</td>
                    <td>
                      {line.match_status === "matched" ? (
                        <span className="badge badge-matched">matched{line.match_method ? ` · ${line.match_method}` : ""}</span>
                      ) : line.match_status === "exception" ? (
                        <span className="badge badge-exception">{line.exception_type?.replace(/_/g, " ") || "exception"}</span>
                      ) : (
                        <span className="badge badge-draft">{line.match_status}</span>
                      )}
                      {line.is_anomaly && <span title="Flagged as a possible price typo — this bid is far from the others on the same item. See the Exceptions page for the full reason." className="badge badge-closed" style={{ marginLeft: "4px", cursor: "help" }}>anomaly</span>}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {line.is_winner ? <span style={{ color: "var(--success)", fontSize: "1rem" }}>★</span> : <span style={{ color: "var(--text-4)" }}>—</span>}
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
        </div>

      </div>
    </AdminLayout>
  );
}
