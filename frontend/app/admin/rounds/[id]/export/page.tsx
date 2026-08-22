"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";
import Link from "next/link";

interface Buyer {
  id: number;
  full_name: string;
  company_name: string;
  email: string;
  invite_status: string;
}

export default function ExportCenter() {
  const { id } = useParams();
  const [roundName, setRoundName] = useState("");
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [roundStatus, setRoundStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  }

  useEffect(() => {
    Promise.all([
      api.get(`/rounds/${id}`).then((r) => { setRoundName(r.data.name); setRoundStatus(r.data.status); }),
      api.get(`/rounds/${id}/buyers`).then((r) => setBuyers(r.data)).catch(() => {}),
    ]);
  }, [id]);

  async function sendResultsNotifications() {
    setSending(true);
    try {
      const res = await api.post(`/rounds/${id}/send-results`);
      flash(`✓ Results sent to ${res.data.sent} buyer(s)`);
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to send notifications", "err");
    } finally {
      setSending(false);
    }
  }

  const isComplete = roundStatus === "complete";
  const slug = roundName.replace(/\s+/g, "_");

  return (
    <AdminLayout>
      <div className="page-shell animate-in">
        <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Round Detail
        </Link>
        <div className="page-header" style={{ marginBottom: "16px" }}>
          <div className="page-header-text">
            <p className="page-eyebrow">Rounds</p>
            <h1 className="page-title">
              Export Center
            </h1>
            <p className="page-subtitle">
              {roundName}
            </p>
          </div>
          {isComplete && (
            <button
              onClick={sendResultsNotifications}
              disabled={sending}
              className="btn-success"
            >
              {sending ? "Sending..." : "Send Results to All Buyers"}
            </button>
          )}
        </div>

        {msg && (
          <div style={{
            marginTop: "12px", marginBottom: "8px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            border: `1px solid ${msgType === "ok" ? "var(--success-border)" : "var(--danger-border)"}`,
            color: msgType === "ok" ? "var(--success)" : "var(--danger)",
          }}>
            {msg}
          </div>
        )}

        {!isComplete && (
          <div style={{
            padding: "14px 18px",
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
            borderRadius: "12px",
            marginTop: "12px",
            marginBottom: "24px",
            fontSize: "0.83rem",
            color: "var(--warning)",
          }}>
            ⚠ Round is not yet complete. Some exports will be empty until bids are processed and deals approved.
          </div>
        )}

        <div style={{ height: "24px" }} />

        {/* The two things admins actually reach for — everything else is tucked under Advanced. */}
        <HeroCard
          onClick={() => downloadFile(`/rounds/${id}/export/report-pack.zip`, `winning_buyers_report_${slug}.zip`)}
          accent="var(--success)"
          badge="ZIP"
          title="Download Full Report of Winning Buyers"
          description="One ZIP with everything: who won each item and at what price, the professional bid-comparison sheet, per-buyer award sheets, and the Razor upload files. This is the all-in-one report."
        />
        <HeroCard
          onClick={() => downloadFile(`/rounds/${id}/export/razor-per-customer.zip`, `razor_upload_${slug}.zip`)}
          accent="var(--info)"
          badge="RAZOR"
          title="Razor Upload — one file per winning customer"
          description="Exactly what you upload into Razor: one Excel per winning customer, one row per physical device with Model, Serial, UID and Price. Approved deals only."
        />

        <details style={{ marginTop: "8px" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "var(--text-4)", padding: "10px 4px", userSelect: "none" }}>
            More formats &amp; individual files
          </summary>
          <div style={{ marginTop: "12px" }}>
            <Section title="Winners & Bid Results">
              <ExportRow
                label="Bid Comparison — bid tab (.xlsx)"
                description="One row per model, every buyer's price side-by-side, winner highlighted."
                path={`/rounds/${id}/export/comparison.xlsx`}
                filename={`bid_comparison_${slug}.xlsx`}
                ext="xlsx"
              />
              <ExportRow
                label="Deals Export (.xlsx)"
                description="All deals with winner, price, quantity, and Razor status."
                path={`/rounds/${id}/export/deals.xlsx`}
                filename={`deals_${slug}.xlsx`}
                ext="xlsx"
              />
              <ExportRow
                label="Deals Export (.csv)"
                description="Same as above in CSV format."
                path={`/rounds/${id}/export/deals.csv`}
                filename={`deals_${slug}.csv`}
                ext="csv"
              />
              <ExportRow
                label="Bid Comparison Table (browser)"
                description="Interactive virtual-scroll comparison with winner highlights."
                path={`/admin/rounds/${id}/comparison`}
                filename=""
                ext="view"
                internal
              />
            </Section>

            <Section title="Buyer Award Sheets">
              <ExportRow
                label="All Award Sheets (.zip)"
                description="One Excel per buyer inside a ZIP — wins and loss notices with fluffed prices."
                path={`/rounds/${id}/export/all-awards.zip`}
                filename={`award_sheets_${slug}.zip`}
                ext="zip"
              />
              {buyers.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: "0 0 8px" }}>
                    Individual buyer award sheets:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {buyers.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => downloadFile(`/rounds/${id}/export/award-sheet/${b.id}`, `award_${b.company_name || b.full_name}_${slug}.xlsx`)}
                        style={{
                          padding: "5px 14px",
                          background: "var(--surface)",
                          border: "1px solid var(--border-mid)",
                          borderRadius: "8px",
                          fontSize: "0.78rem",
                          color: "var(--text-2)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(61,129,227,0.4)")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-mid)")}
                      >
                        ↓ {b.company_name || b.full_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section title="ERP & Finance">
              <ExportRow
                label="Razor Sales Order (.csv)"
                description="Flat Razor CSV for approved deals — one line per deal."
                path={`/rounds/${id}/export/razor.csv`}
                filename={`razor_order_${slug}.csv`}
                ext="csv"
              />
              <ExportRow
                label="Margin Report (.xlsx)"
                description="Reserve vs. winning price breakdown — margin $ and % per line item."
                path={`/rounds/${id}/export/margin-report.xlsx`}
                filename={`margin_report_${slug}.xlsx`}
                ext="xlsx"
              />
              <ExportRow
                label="Inventory Disposition Report (.xlsx)"
                description="Every master line with disposition: AWARDED, NO_BIDS, BELOW_RESERVE, or PENDING."
                path={`/rounds/${id}/export/disposition.xlsx`}
                filename={`disposition_${slug}.xlsx`}
                ext="xlsx"
              />
              <ExportRow
                label="ERP Line-Item Report (.xlsx)"
                description="One row per unit with part number, serial # placeholder, and winning price — ready for broker ERP upload."
                path={`/rounds/${id}/export/erp-report.xlsx`}
                filename={`erp_report_${slug}.xlsx`}
                ext="xlsx"
              />
            </Section>
          </div>
        </details>
      </div>
    </AdminLayout>
  );
}

function HeroCard({ onClick, accent, badge, title, description }: {
  onClick: () => void; accent: string; badge: string; title: string; description: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", gap: "16px",
        padding: "18px 20px", marginBottom: "14px",
        background: "var(--bg-2)", border: `1px solid ${accent}55`,
        borderRadius: "var(--radius-xl)", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${accent}55`; }}
    >
      <div style={{
        flexShrink: 0, width: "52px", height: "52px", borderRadius: "12px",
        background: `${accent}22`, border: `1px solid ${accent}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", color: accent,
      }}>
        {badge}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px", fontSize: "0.98rem" }}>{title}</p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-4)", margin: 0, lineHeight: 1.45 }}>{description}</p>
      </div>
      <span style={{ flexShrink: 0, fontSize: "1.3rem", color: accent }}>⬇</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: "24px", marginBottom: "16px" }}>
      <p style={{ fontWeight: 600, color: "var(--text-1)", margin: "0 0 16px", fontSize: "0.9rem" }}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {children}
      </div>
    </div>
  );
}

function ExportRow({ label, description, path, filename, ext, internal }: {
  label: string; description: string; path: string; filename: string; ext: string; internal?: boolean;
}) {
  const extColor: Record<string, string> = {
    xlsx: "var(--success)", csv: "var(--info)", zip: "var(--warning)", view: "var(--violet-bright)",
  };

  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        transition: "all 0.15s",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-mid)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
    >
      <div>
        <p style={{ fontWeight: 500, color: "var(--text-1)", margin: "0 0 3px", fontSize: "0.85rem" }}>{label}</p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: 0 }}>{description}</p>
      </div>
      <span style={{
        padding: "3px 10px",
        borderRadius: "6px",
        background: `${extColor[ext] || "var(--surface)"}20`,
        border: `1px solid ${extColor[ext] || "var(--surface)"}40`,
        color: extColor[ext] || "var(--text-3)",
        fontSize: "0.72rem",
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
        flexShrink: 0,
        marginLeft: 16,
      }}>
        {ext === "view" ? "View →" : `↓ ${ext}`}
      </span>
    </div>
  );

  if (internal) {
    return <Link href={path} style={{ textDecoration: "none" }}>{inner}</Link>;
  }

  return (
    <button
      onClick={() => downloadFile(path, filename)}
      style={{ background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer" }}
    >
      {inner}
    </button>
  );
}
