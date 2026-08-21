"use client";
import AdminLayout from "@/components/AdminLayout";

interface Section {
  title: string;
  icon: string;
  items: { label: string; detail: string }[];
}

const sections: Section[] = [
  {
    title: "Daily Operations",
    icon: "📋",
    items: [
      { label: "Open a new bid round", detail: "Go to Bid Rounds → New Round. Complete the 4-step wizard: (1) name/commodity/deadline, (2) upload master file (Excel/CSV), (3) assign buyers, (4) open round." },
      { label: "Monitor submissions", detail: "On the round detail page, the Submissions tab shows each buyer's file, line count, and parse status in real time." },
      { label: "Handle exceptions", detail: "After upload processing, review unmatched lines in the Exceptions tab. Use AI suggestions (≥85% confidence auto-accept), manual remap, or bulk-approve." },
      { label: "Close a round and select winners", detail: "Click 'Close Round' on the round detail page. The system runs the winner selection engine automatically — highest valid bid wins per line item." },
      { label: "Approve deals", detail: "Review each deal in the Deals tab. Approve individually or use Approve All. If AUTO_PUSH_RAZOR=true in env, deals push to Razor ERP on approval automatically." },
      { label: "Send award sheets", detail: "After approval, go to Exports and download All Award Sheets (.zip). Each buyer's sheet shows their wins and fluffed loss notices." },
    ],
  },
  {
    title: "Buyer Management",
    icon: "👥",
    items: [
      { label: "Create a buyer account", detail: "Buyers → New Buyer. Fill in name, company, email. They receive an invite email with a one-time setup link (72hr expiry)." },
      { label: "Resend invite", detail: "On the buyer detail page, click 'Resend Invite'. A new token is generated (old one invalidated)." },
      { label: "Enable / disable a buyer", detail: "Toggle the Active switch on any buyer row. Disabled buyers cannot log in or submit bids." },
      { label: "Configure fluff settings", detail: "Go to Fluff Settings in the sidebar. Set the obfuscation % per buyer (default 3.5%). Losers see: real_winning_price × (1 + fluff%)." },
      { label: "Review buyer performance", detail: "Click any buyer to see their win rate, total lines bid/won, margin contribution, and bid history." },
    ],
  },
  {
    title: "Exports & Reports",
    icon: "📊",
    items: [
      { label: "Deal results Excel", detail: "Round → Exports → deals.xlsx — all approved deals with winner details." },
      { label: "Bid comparison Excel", detail: "Round → Exports → comparison.xlsx — all matched lines from all buyers side by side." },
      { label: "Disposition report", detail: "Round → Exports → disposition.xlsx — shows every master item with status: AWARDED, NO_BIDS, BELOW_RESERVE, or PENDING." },
      { label: "Razor ERP CSV", detail: "Round → Exports → razor.csv — formatted for Razor import if auto-push is not configured." },
      { label: "Margin report", detail: "Round → Exports → margin-report.xlsx — per-item margin vs reserve price." },
      { label: "Global dashboard", detail: "Reports tab shows lifetime KPIs: total awarded value, # rounds, win rates, top buyers." },
    ],
  },
  {
    title: "Razor ERP Integration",
    icon: "🔌",
    items: [
      { label: "Manual push", detail: "Deal → Push to Razor button on any approved deal. Or use the bulk Push All button on the round Deals tab." },
      { label: "Auto-push on approval", detail: "Set AUTO_PUSH_RAZOR=true in backend .env to push automatically when each deal is approved." },
      { label: "Push status", detail: "Each deal shows razor_push_status: pending, success, or failed. Failed deals show the error and fallback download link." },
      { label: "Credentials", detail: "Set RAZOR_API_URL and RAZOR_API_KEY in backend/.env. The client retries 3× with exponential backoff on failure." },
    ],
  },
  {
    title: "Email Bid Ingestion",
    icon: "📧",
    items: [
      { label: "Setup", detail: "Configure SendGrid Inbound Parse to forward emails sent to bids@thinktls.com to https://yourhost/api/inbound-email." },
      { label: "How buyers submit", detail: "Buyer emails their pricing file as an Excel/CSV attachment. Subject must contain round ID: e.g. 'Bid Round 5' or '[RID:5]'." },
      { label: "Signature validation", detail: "Set SENDGRID_WEBHOOK_KEY in backend/.env to enable signature verification and prevent spoofed webhooks." },
      { label: "Auto-acknowledgement", detail: "Buyers automatically receive a confirmation email on success or a helpful error if the file couldn't be parsed." },
    ],
  },
  {
    title: "System Administration",
    icon: "⚙️",
    items: [
      { label: "Environment variables", detail: "See backend/.env.example for all required keys: DATABASE_URL, SECRET_KEY, SENDGRID_API_KEY, RAZOR_API_URL, RAZOR_API_KEY, AUTO_PUSH_RAZOR, SENDGRID_WEBHOOK_KEY." },
      { label: "Database migrations", detail: "Run: cd backend && alembic upgrade head — applies all pending schema migrations." },
      { label: "Auto-pruning", detail: "A nightly APScheduler job auto-deletes bid files and lines from rounds closed > 90 days ago to control database size." },
      { label: "Rate limiting", detail: "Login endpoint is rate-limited to 10 attempts per 5 minutes per IP. Resets on successful login." },
      { label: "Running tests", detail: "cd backend && pytest — runs the full suite against an in-memory SQLite database. All tests should pass before deploying." },
      { label: "AI query", detail: "Admins can use the AI Query tab to ask natural-language questions about bid data (e.g. 'Which buyer has the highest win rate in round 3?')." },
    ],
  },
  {
    title: "Troubleshooting",
    icon: "🔧",
    items: [
      { label: "Buyer can't log in", detail: "Check: is_active flag, is_approved flag, password set via invite link. Resend invite if needed." },
      { label: "Master file parse errors", detail: "Ensure the file has columns: part_number, description, quantity. Download the template from the round page for the exact format." },
      { label: "Exceptions not resolving", detail: "Check that the master item exists and the normalized part number matches. Use the master search in the exception card to find alternatives." },
      { label: "Razor push failing", detail: "Check RAZOR_API_URL is set and accessible. Check the notification bell for error messages. Use CSV export as fallback." },
      { label: "Emails not received by buyers", detail: "Verify SENDGRID_API_KEY is valid. Check SendGrid activity log. Ensure FROM_EMAIL is an authenticated sender." },
      { label: "Performance", detail: "For > 5,000 line items, the bid comparison table uses virtual scrolling — expect < 100ms render. DB indexes are set on part_number_normalized, bid_round_id, and buyer_id." },
    ],
  },
];

export default function AdminGuidePage() {
  return (
    <AdminLayout>
      <div style={{ maxWidth: "860px" }} className="animate-in">
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ color: "var(--text-1)", fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 8px" }}>
            Admin Handover Guide
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Complete operational reference for ThinkTLS Bid Desk administrators.
            Covers daily workflows, configuration, exports, integrations, and troubleshooting.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {sections.map(sec => (
            <div key={sec.title} className="glass" style={{ borderRadius: "14px", overflow: "hidden" }}>
              <div style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}>
                <span style={{ fontSize: "1.2rem" }}>{sec.icon}</span>
                <h2 style={{ color: "var(--text-1)", fontWeight: 700, fontSize: "1rem", margin: 0 }}>{sec.title}</h2>
              </div>
              <div style={{ padding: "8px 0" }}>
                {sec.items.map((item, i) => (
                  <div key={i} style={{
                    padding: "12px 20px",
                    borderBottom: i < sec.items.length - 1 ? "1px solid var(--border)" : "none",
                    display: "grid",
                    gridTemplateColumns: "220px 1fr",
                    gap: "16px",
                    alignItems: "start",
                  }}>
                    <div style={{ color: "var(--text-1)", fontWeight: 500, fontSize: "0.85rem", paddingTop: "1px" }}>
                      {item.label}
                    </div>
                    <div style={{ color: "var(--text-2)", fontSize: "0.83rem", lineHeight: 1.6 }}>
                      {item.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: "28px",
          padding: "16px 20px",
          background: "rgba(61,129,227,0.06)",
          border: "1px solid rgba(61,129,227,0.15)",
          borderRadius: "12px",
          fontSize: "0.82rem",
          color: "var(--text-3)",
          textAlign: "center",
        }}>
          ThinkTLS Bid Desk — Internal Platform — Authorized Users Only
        </div>
      </div>
    </AdminLayout>
  );
}
