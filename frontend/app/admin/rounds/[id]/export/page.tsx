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
      <div style={{ maxWidth: "780px" }} className="animate-in">
        <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Round Detail
        </Link>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "4px" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>
              Export Center
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
              {roundName}
            </p>
          </div>
          {isComplete && (
            <button
              onClick={sendResultsNotifications}
              disabled={sending}
              className="btn-brand"
              style={{ background: "#0d7c66" }}
            >
              {sending ? "Sending..." : "Send Results to All Buyers"}
            </button>
          )}
        </div>

        {msg && (
          <div style={{
            marginTop: "12px", marginBottom: "8px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: msgType === "ok" ? "#34d399" : "#f87171",
          }}>
            {msg}
          </div>
        )}

        {!isComplete && (
          <div style={{
            padding: "14px 18px",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: "12px",
            marginTop: "12px",
            marginBottom: "24px",
            fontSize: "0.83rem",
            color: "#fbbf24",
          }}>
            ⚠ Round is not yet complete. Some exports will be empty until bids are processed and deals approved.
          </div>
        )}

        <div style={{ height: "24px" }} />

        {/* One-click bundle of every report below. */}
        <button
          onClick={() => downloadFile(`/rounds/${id}/export/report-pack.zip`, `report_pack_${slug}.zip`)}
          className="btn-brand"
          style={{ width: "100%", padding: "14px", fontSize: "0.9rem", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
        >
          ⬇ Download Full Report Pack (everything in one ZIP)
        </button>

        <Section title="Bid Results">
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
            label="Full Bid Comparison (.xlsx)"
            description="All buyer prices side-by-side — every matched line, every buyer."
            path={`/rounds/${id}/export/comparison.xlsx`}
            filename={`comparison_${slug}.xlsx`}
            ext="xlsx"
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
              <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", margin: "0 0 8px" }}>
                Individual buyer award sheets:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {buyers.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => downloadFile(`/rounds/${id}/export/award-sheet/${b.id}`, `award_${b.company_name || b.full_name}_${slug}.xlsx`)}
                    style={{
                      padding: "5px 14px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      color: "rgba(255,255,255,0.7)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(61,129,227,0.4)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
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
            description="Razor-compatible format for approved deals. Only includes status=approved."
            path={`/rounds/${id}/export/razor.csv`}
            filename={`razor_order_${slug}.csv`}
            ext="csv"
          />
          <ExportRow
            label="Razor Upload — per customer (.zip)"
            description="One CSV per customer sale with Model, Serial, UID and Price — ready to upload into Razor. Approved deals only."
            path={`/rounds/${id}/export/razor-per-customer.zip`}
            filename={`razor_per_customer_${slug}.zip`}
            ext="zip"
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

        <Section title="Analysis">
          <ExportRow
            label="Bid Comparison Table (browser)"
            description="Interactive virtual-scroll comparison with winner highlights."
            path={`/admin/rounds/${id}/comparison`}
            filename=""
            ext="view"
            internal
          />
        </Section>
      </div>
    </AdminLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-xl)",
      padding: "24px",
      marginBottom: "16px",
    }}>
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
    xlsx: "#34d399", csv: "#60a5fa", zip: "#fbbf24", view: "#a78bfa",
  };

  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "10px",
        transition: "all 0.15s",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.14)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
    >
      <div>
        <p style={{ fontWeight: 500, color: "var(--text-1)", margin: "0 0 3px", fontSize: "0.85rem" }}>{label}</p>
        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>{description}</p>
      </div>
      <span style={{
        padding: "3px 10px",
        borderRadius: "6px",
        background: `${extColor[ext] || "rgba(255,255,255,0.1)"}20`,
        border: `1px solid ${extColor[ext] || "rgba(255,255,255,0.1)"}40`,
        color: extColor[ext] || "rgba(255,255,255,0.5)",
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
