"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
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
  quantity: number | null;
  reserve_price: number | null;
  bids: Record<string, BidEntry>;
}

interface ComparisonData {
  buyers: string[];
  rows: ComparisonRow[];
}

const COL_W_PART = 180;
const COL_W_DESC = 260;
const COL_W_QTY  = 70;
const COL_W_RES  = 90;
const COL_W_BID  = 120;
const ROW_H      = 40;
const HEADER_H   = 44;

export default function ComparisonPage() {
  const { id } = useParams();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [roundName, setRoundName] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.get(`/rounds/${id}/comparison`).then((r) => r.data),
      api.get(`/rounds/${id}`).then((r) => r.data.name),
    ]).then(([comp, name]) => {
      setData(comp);
      setRoundName(name);
    }).finally(() => setLoading(false));
  }, [id]);

  const virtualizer = useVirtualizer({
    count: data?.rows.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  if (loading) return (
    <AdminLayout>
      <div style={{ color: "rgba(255,255,255,0.3)", paddingTop: "60px", textAlign: "center" }}>Loading comparison...</div>
    </AdminLayout>
  );

  if (!data) return (
    <AdminLayout>
      <div style={{ color: "#f87171", paddingTop: "60px", textAlign: "center" }}>Failed to load comparison data.</div>
    </AdminLayout>
  );

  const { buyers, rows } = data;
  const totalCols = 4 + buyers.length; // part, desc, qty, reserve + one per buyer
  const totalWidth = COL_W_PART + COL_W_DESC + COL_W_QTY + COL_W_RES + buyers.length * COL_W_BID;

  const items = virtualizer.getVirtualItems();

  return (
    <AdminLayout>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <Link href={`/admin/rounds/${id}`} style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
              ← Round Detail
            </Link>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "8px 0 4px" }}>
              Bid Comparison
            </h2>
            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
              {roundName} · {rows.length.toLocaleString()} items · {buyers.length} buyer{buyers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <a
              href={`http://localhost:8000/api/rounds/${id}/export/comparison.xlsx`}
              className="btn-ghost"
              style={{ textDecoration: "none", fontSize: "0.8rem" }}
              target="_blank"
              rel="noreferrer"
            >
              ↓ Export .xlsx
            </a>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "0.75rem" }}>
          {[
            { color: "#34d399", bg: "rgba(52,211,153,0.12)", label: "Winner" },
            { color: "#f87171", bg: "rgba(239,68,68,0.1)", label: "Below reserve" },
            { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", label: "Anomaly" },
          ].map(({ color, bg, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${color}` }} />
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Scrollable table container */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "16px",
          overflow: "hidden",
        }}>
          {/* Sticky header */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ width: totalWidth, minWidth: "100%" }}>
              <div style={{
                display: "flex",
                height: HEADER_H,
                background: "rgba(30,58,95,0.6)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                position: "sticky",
                top: 0,
                zIndex: 10,
              }}>
                <HeaderCell width={COL_W_PART}>Part Number</HeaderCell>
                <HeaderCell width={COL_W_DESC}>Description</HeaderCell>
                <HeaderCell width={COL_W_QTY} center>Qty</HeaderCell>
                <HeaderCell width={COL_W_RES} center>Reserve $</HeaderCell>
                {buyers.map((b) => (
                  <HeaderCell key={b} width={COL_W_BID} center>{b}</HeaderCell>
                ))}
              </div>

              {/* Virtualized rows */}
              <div
                ref={parentRef}
                style={{ height: Math.min(rows.length * ROW_H, 600), overflowY: "auto", overflowX: "auto" }}
              >
                <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                  {items.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    // Find winner price for this item
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
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          background: virtualRow.index % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                        }}
                      >
                        <Cell width={COL_W_PART} mono>{row.part_number}</Cell>
                        <Cell width={COL_W_DESC} muted>{row.description || ""}</Cell>
                        <Cell width={COL_W_QTY} center muted>{row.quantity ?? "—"}</Cell>
                        <Cell width={COL_W_RES} center muted>
                          {row.reserve_price ? `$${row.reserve_price.toFixed(2)}` : "—"}
                        </Cell>
                        {buyers.map((buyerName) => {
                          const entry = row.bids[buyerName];
                          if (!entry || entry.unit_price == null) {
                            return <Cell key={buyerName} width={COL_W_BID} center muted>—</Cell>;
                          }
                          const price = entry.unit_price;
                          const isWinner = entry.is_winner;
                          const isAnomaly = entry.is_anomaly;
                          const belowReserve = row.reserve_price != null && price < row.reserve_price;

                          let bg = "transparent";
                          let color = "rgba(255,255,255,0.7)";
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
                                borderLeft: "1px solid rgba(255,255,255,0.04)",
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
          <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)" }}>
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
      color: "rgba(255,255,255,0.55)",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      borderRight: "1px solid rgba(255,255,255,0.05)",
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
      color: muted ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.85)",
      fontFamily: mono ? "monospace" : undefined,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      borderRight: "1px solid rgba(255,255,255,0.03)",
    }}>
      {children}
    </div>
  );
}
