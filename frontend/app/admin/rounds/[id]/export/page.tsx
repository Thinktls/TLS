"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface Buyer {
  id: number;
  full_name: string;
  company_name: string;
  email: string;
  invite_status: string;
}

const API_BASE = "http://localhost:8000/api";

export default function ExportCenter() {
  const { id } = useParams();
  const [roundName, setRoundName] = useState("");
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [roundStatus, setRoundStatus] = useState("");

  useEffect(() => {
    Promise.all([
      api.get(`/rounds/${id}`).then((r) => { setRoundName(r.data.name); setRoundStatus(r.data.status); }),
      api.get(`/rounds/${id}/buyers`).then((r) => setBuyers(r.data)).catch(() => {}),
    ]);
  }, [id]);

  const isComplete = roundStatus === "complete";

  return (
    <AdminLayout>
      <div style={{ maxWidth: "780px" }}>
        <Link href={`/admin/rounds/${id}`} style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Round Detail
        </Link>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "10px 0 4px" }}>
          Export Center
        </h2>
        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "32px" }}>
          {roundName} — All downloads are auth-gated and served from the API.
        </p>

        {!isComplete && (
          <div style={{
            padding: "14px 18px",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: "12px",
            marginBottom: "24px",
            fontSize: "0.83rem",
            color: "#fbbf24",
          }}>
            ⚠ Round is not yet complete. Some exports will be empty until bids are processed and deals approved.
          </div>
        )}

        <Section title="Bid Results">
          <ExportRow
            label="Deals Export (.xlsx)"
            description="All deals with winner, price, quantity, and Razor status."
            href={`${API_BASE}/rounds/${id}/export/deals.xlsx`}
            ext="xlsx"
          />
          <ExportRow
            label="Deals Export (.csv)"
            description="Same as above in CSV format."
            href={`${API_BASE}/rounds/${id}/export/deals.csv`}
            ext="csv"
          />
          <ExportRow
            label="Full Bid Comparison (.xlsx)"
            description="All buyer prices side-by-side — every matched line, every buyer."
            href={`${API_BASE}/rounds/${id}/export/comparison.xlsx`}
            ext="xlsx"
          />
        </Section>

        <Section title="Buyer Award Sheets">
          <ExportRow
            label="All Award Sheets (.zip)"
            description="One Excel per buyer inside a ZIP — wins and loss notices with fluffed prices."
            href={`${API_BASE}/rounds/${id}/export/all-awards.zip`}
            ext="zip"
          />
          {buyers.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", margin: "0 0 8px" }}>
                Individual buyer award sheets:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {buyers.map((b) => (
                  <a
                    key={b.id}
                    href={`${API_BASE}/rounds/${id}/export/award-sheet/${b.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "5px 14px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      color: "rgba(255,255,255,0.7)",
                      textDecoration: "none",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(61,129,227,0.4)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                  >
                    ↓ {b.company_name || b.full_name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="ERP & Finance">
          <ExportRow
            label="Razor Sales Order (.csv)"
            description="Razor-compatible format for approved deals. Only includes status=approved."
            href={`${API_BASE}/rounds/${id}/export/razor.csv`}
            ext="csv"
          />
          <ExportRow
            label="Margin Report (.xlsx)"
            description="Reserve vs. winning price breakdown — margin $ and % per line item."
            href={`${API_BASE}/rounds/${id}/export/margin-report.xlsx`}
            ext="xlsx"
          />
        </Section>

        <Section title="Analysis">
          <ExportRow
            label="Bid Comparison Table (browser)"
            description="Interactive virtual-scroll comparison with winner highlights."
            href={`/admin/rounds/${id}/comparison`}
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
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "16px",
      padding: "24px",
      marginBottom: "16px",
    }}>
      <p style={{ fontWeight: 600, color: "white", margin: "0 0 16px", fontSize: "0.9rem" }}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {children}
      </div>
    </div>
  );
}

function ExportRow({ label, description, href, ext, internal }: {
  label: string; description: string; href: string; ext: string; internal?: boolean;
}) {
  const extColor: Record<string, string> = {
    xlsx: "#34d399", csv: "#60a5fa", zip: "#fbbf24", view: "#a78bfa",
  };
  const content = (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "10px",
      transition: "all 0.15s",
      cursor: "pointer",
      textDecoration: "none",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.14)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
    >
      <div>
        <p style={{ fontWeight: 500, color: "white", margin: "0 0 3px", fontSize: "0.85rem" }}>{label}</p>
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
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        flexShrink: 0,
        marginLeft: 16,
      }}>
        {ext === "view" ? "View →" : `↓ ${ext}`}
      </span>
    </div>
  );

  if (internal) {
    return <Link href={href} style={{ textDecoration: "none" }}>{content}</Link>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      {content}
    </a>
  );
}
