"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";
import Link from "next/link";

interface BidEntry {
  buyer_id: number;
  unit_price: number | null;
  is_winner: boolean;
  is_anomaly: boolean;
  bid_line_id: number;
}

interface ComparisonRow {
  master_item_id: number;
  part_number: string;
  description: string | null;
  category: string | null;
  quantity: number | null;
  reserve_price: number | null;
  extra_columns: Record<string, string> | null;
  bids: Record<string, BidEntry>;
}

interface BuyerCoverage {
  buyer: string;
  quoted: number;
  not_quoted: number;
  total_items: number;
  quoted_pct: number;
}

interface ComparisonData {
  buyers: string[];
  rows: ComparisonRow[];
  coverage?: BuyerCoverage[];
  total_items?: number;
}

const COL_W_ITEM  = 280;  // Model name + part number sub-line
const COL_W_GRADE = 100;  // Grade / condition
const COL_W_QTY   = 70;
const COL_W_RES   = 90;
const COL_W_BID   = 120;
const ROW_H       = 52;   // Taller to fit two-line model/serial cell
const HEADER_H    = 44;

export default function ComparisonPage() {
  const { id } = useParams();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [roundName, setRoundName] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  function fetchData() {
    setLoadError(false);
    setLoading(true);
    Promise.all([
      api.get(`/rounds/${id}/comparison`).then((r) => r.data),
      api.get(`/rounds/${id}`).then((r) => r.data.name),
    ]).then(([comp, name]) => {
      setData(comp);
      setRoundName(name);
    }).catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [id]);

  const virtualizer = useVirtualizer({
    count: data?.rows.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (loadError || !data) return (
    <AdminLayout>
      <div style={{ textAlign: "center", paddingTop: "80px" }}>
        <p style={{ color: "#f87171", fontSize: "0.9rem", marginBottom: "12px" }}>Failed to load comparison data.</p>
        <button onClick={fetchData} className="btn-ghost" style={{ fontSize: "0.82rem" }}>Retry</button>
      </div>
    </AdminLayout>
  );

  const { buyers, rows } = data;
  const isUnitLevel = rows.some(r => r.category);
  const totalWidth = COL_W_ITEM + (isUnitLevel ? COL_W_GRADE : 0) + COL_W_QTY + COL_W_RES + buyers.length * COL_W_BID;

  // Build name → buyer_id map from the first bid entry found for each buyer
  const buyerIdMap: Record<string, number> = {};
  for (const row of rows) {
    for (const [name, entry] of Object.entries(row.bids)) {
      if (!(name in buyerIdMap)) buyerIdMap[name] = (entry as any).buyer_id;
    }
  }

  const items = virtualizer.getVirtualItems();

  return (
    <AdminLayout>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Round Detail
            </Link>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>
              Bid Comparison
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
              {roundName} · {rows.length.toLocaleString()} items · {buyers.length} buyer{buyers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              aria-label="Export bid comparison as Excel file"
              onClick={() => downloadFile(`/rounds/${id}/export/comparison.xlsx`, `comparison_round_${id}.xlsx`)}
              className="btn-ghost"
              style={{ fontSize: "0.8rem" }}
            >
              ↓ Export .xlsx
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "0.75rem" }}>
          {[
            { color: "#34d399", bg: "rgba(52,211,153,0.12)", label: "Winner", tip: "Highest valid bid on this item — the awarded price." },
            { color: "#f87171", bg: "rgba(239,68,68,0.1)", label: "Below reserve", tip: "Bid is under your minimum acceptable price and can't win without an override." },
            { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", label: "Anomaly", tip: "Possible price typo — this bid is far above or below the others on the same item." },
            { color: "var(--text-4)", bg: "transparent", label: "not quoted", tip: "This buyer did not put a price on this device — either they left it blank or never bid on it." },
          ].map(({ color, bg, label, tip }) => (
            <div key={label} title={tip} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "help" }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${color}` }} />
              <span style={{ color: "var(--text-3)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Per-buyer coverage. With thousands of devices per round the admin needs to see, at a
            glance, how much of the lot each buyer actually priced — not scroll for gaps. */}
        {data?.coverage && data.coverage.length > 0 && (
          <div style={{
            display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px",
          }}>
            {data.coverage.map((c) => {
              const full = c.not_quoted === 0;
              return (
                <div
                  key={c.buyer}
                  title={`${c.buyer} priced ${c.quoted.toLocaleString()} of ${c.total_items.toLocaleString()} devices in this round and did not quote ${c.not_quoted.toLocaleString()}.`}
                  style={{
                    padding: "6px 12px", borderRadius: "8px", cursor: "help",
                    background: full ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.07)",
                    border: `1px solid ${full ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.22)"}`,
                    fontSize: "0.72rem",
                  }}
                >
                  <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{c.buyer}</span>
                  <span style={{ color: full ? "#34d399" : "#fbbf24", marginLeft: "8px" }}>
                    quoted {c.quoted.toLocaleString()}/{c.total_items.toLocaleString()} ({c.quoted_pct}%)
                  </span>
                  {!full && (
                    <span style={{ color: "var(--text-3)", marginLeft: "6px" }}>
                      · {c.not_quoted.toLocaleString()} not quoted
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Scrollable table container */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
        }}>
          {/* Single horizontal scroll context — header and body scroll together */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ width: totalWidth, minWidth: "100%" }}>
              {/* Header — sits above body in normal flow, scrolls horizontally with it */}
              <div style={{
                display: "flex",
                height: HEADER_H,
                background: "rgba(30,58,95,0.95)",   // opaque so the white header text reads in light mode too
                borderBottom: "1px solid var(--border)",
              }}>
                <HeaderCell width={COL_W_ITEM}>Model / Part</HeaderCell>
                {isUnitLevel && <HeaderCell width={COL_W_GRADE} center>Grade</HeaderCell>}
                <HeaderCell width={COL_W_QTY} center>Qty</HeaderCell>
                <HeaderCell width={COL_W_RES} center>Reserve $</HeaderCell>
                {buyers.map((b) => (
                  <HeaderCell key={b} width={COL_W_BID} center>
                    {buyerIdMap[b] ? (
                      <Link
                        href={`/admin/rounds/${id}/buyers/${buyerIdMap[b]}`}
                        style={{ color: "#60a5fa", textDecoration: "none", fontSize: "0.72rem", fontWeight: 700 }}
                        title={`View ${b}'s bids for this round`}
                      >
                        {b} ↗
                      </Link>
                    ) : b}
                  </HeaderCell>
                ))}
              </div>

              {/* Virtualized rows — vertical scroll only; horizontal handled by parent */}
              <div
                ref={parentRef}
                style={{ height: Math.min(rows.length * ROW_H, 600), overflowY: "auto" }}
              >
                <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                  {items.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    const winnerEntry = Object.values(row.bids).find((b) => b.is_winner);
                    const winnerPrice = winnerEntry?.unit_price;

                    return (
                      <div
                        key={virtualRow.key}
                        style={{
                          position: "absolute",
                          top: virtualRow.start,
                          left: 0,
                          width: "100%",
                          height: ROW_H,
                          display: "flex",
                          alignItems: "center",
                          borderBottom: "1px solid var(--border)",
                          background: virtualRow.index % 2 === 0 ? "var(--surface)" : "transparent",
                        }}
                      >
                        {/* Two-line item cell: model name on top, part number / serial below */}
                        <div style={{
                          width: COL_W_ITEM, flexShrink: 0,
                          display: "flex", flexDirection: "column", justifyContent: "center",
                          padding: "0 12px", overflow: "hidden",
                          borderRight: "1px solid var(--border)",
                        }}>
                          <div style={{ fontSize: "0.82rem", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                            {row.description || row.part_number}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-4)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>
                            {row.part_number}
                          </div>
                        </div>
                        {isUnitLevel && (
                          <div style={{
                            width: COL_W_GRADE, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: "0 8px", overflow: "hidden",
                            borderRight: "1px solid var(--border)",
                          }}>
                            {row.category ? (
                              <span style={{
                                fontSize: "0.7rem", fontWeight: 600,
                                padding: "2px 7px", borderRadius: "4px",
                                background: "rgba(52,211,153,0.1)", color: "#34d399",
                                border: "1px solid rgba(52,211,153,0.2)",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                maxWidth: "100%",
                              }}>{row.category}</span>
                            ) : <span style={{ color: "var(--text-4)", fontSize: "0.75rem" }}>—</span>}
                          </div>
                        )}
                        <Cell width={COL_W_QTY} center muted>{row.quantity ?? "—"}</Cell>
                        <Cell width={COL_W_RES} center muted>
                          {row.reserve_price ? `$${row.reserve_price.toFixed(2)}` : "—"}
                        </Cell>
                        {buyers.map((buyerName) => {
                          const entry = row.bids[buyerName];
                          if (!entry || entry.unit_price == null) {
                            // Say it outright. A bare "—" left the admin unable to tell "this
                            // buyer chose not to price this device" from "data missing".
                            const submitted = !!entry;
                            return (
                              <div
                                key={buyerName}
                                title={submitted
                                  ? `${buyerName} submitted a bid for this round but left this device blank — they did not quote it.`
                                  : `${buyerName} did not quote this device.`}
                                style={{
                                  width: COL_W_BID, flexShrink: 0, height: "100%",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  borderLeft: "1px solid var(--border)",
                                  fontSize: "0.68rem", fontStyle: "italic",
                                  color: "var(--text-4)", cursor: "help",
                                }}
                              >
                                not quoted
                              </div>
                            );
                          }
                          const price = entry.unit_price;
                          const isWinner = entry.is_winner;
                          const isAnomaly = entry.is_anomaly;
                          const belowReserve = row.reserve_price != null && price < row.reserve_price;

                          let bg = "transparent";
                          let color = "var(--text-2)";
                          let fw: string | number = 400;

                          if (isWinner) { bg = "rgba(52,211,153,0.12)"; color = "#34d399"; fw = 700; }
                          else if (belowReserve) { bg = "rgba(239,68,68,0.08)"; color = "#f87171"; }
                          else if (isAnomaly) { bg = "rgba(251,191,36,0.08)"; color = "#fbbf24"; }

                          return (
                            <div
                              key={buyerName}
                              style={{
                                width: COL_W_BID,
                                flexShrink: 0,
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: bg,
                                borderLeft: "1px solid var(--border)",
                                fontSize: "0.82rem",
                                fontWeight: fw,
                                color,
                                fontFamily: "monospace",
                              }}
                            >
                              {isWinner && <span style={{ marginRight: 4 }}>★</span>}
                              ${price.toFixed(2)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {rows.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: "60px", color: "var(--text-4)" }}>
            No matched bid lines found. Process the round first.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function HeaderCell({ children, width, center }: { children: React.ReactNode; width: number; center?: boolean }) {
  return (
    <div style={{
      width,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: center ? "center" : "flex-start",
      padding: "0 12px",
      fontSize: "0.72rem",
      fontWeight: 600,
      color: "#ffffff",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      borderRight: "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}

function Cell({ children, width, center, muted, mono }: {
  children: React.ReactNode;
  width: number;
  center?: boolean;
  muted?: boolean;
  mono?: boolean;
}) {
  return (
    <div style={{
      width,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: center ? "center" : "flex-start",
      padding: "0 12px",
      fontSize: "0.8rem",
      // Theme-aware: this table used hardcoded white text that was invisible on the light-mode
      // page — the Model/Part, Qty and Reserve columns looked blank.
      color: muted ? "var(--text-4)" : "var(--text-1)",
      fontFamily: mono ? "monospace" : undefined,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      borderRight: "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}
