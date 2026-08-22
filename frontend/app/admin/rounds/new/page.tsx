"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";
import { fmtDatetime } from "@/lib/format";

const COMMODITIES = [
  "laptops",
  "desktops",
  "servers",
  "networking",
  "storage",
  "monitors",
  "peripherals",
  "mobile devices",
  "printers",
  "software licenses",
  "other",
];
const CUSTOM_VALUE = "__custom__";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 500,
  // Theme-aware: the form card is light in light mode, so a hardcoded white label was
  // invisible (white-on-white) — which is why the field labels didn't show at all.
  color: "var(--text-3)",
  marginBottom: "8px",
};

interface Buyer {
  id: number;
  full_name: string;
  email: string;
  company_name: string;
  is_active: boolean;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "32px" }}>
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div key={step} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.75rem", fontWeight: 700,
            background: step < current
              ? "var(--success-strong)"
              : step === current
                ? "var(--brand)"
                : "var(--surface)",
            color: step <= current ? "var(--text-1)" : "var(--text-4)",
            border: step === current ? "2px solid var(--brand-dim)" : "2px solid transparent",
            transition: "all 0.2s",
          }}>
            {step < current ? "✓" : step}
          </div>
          {step < total && (
            <div style={{
              width: "40px", height: "1px",
              background: step < current ? "var(--success-strong)" : "var(--surface-hover)",
              transition: "background 0.3s",
            }} />
          )}
        </div>
      ))}
      <span style={{ marginLeft: "8px", fontSize: "0.78rem", color: "var(--text-4)" }}>
        Step {current} of {total}
      </span>
    </div>
  );
}

export default function NewRound() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [roundName, setRoundName] = useState("");
  const [masterCount, setMasterCount] = useState<number | null>(null);
  const [assignedBuyerIds, setAssignedBuyerIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  // Step 1 state
  const [form, setForm] = useState({
    name: "",
    commodity: "laptops",
    customer: "",
    notes: "",
    submission_deadline: "",
    reserve_price_enabled: false,
    auto_approve_enabled: false,
  });
  const [customCommodity, setCustomCommodity] = useState("");

  // Step 2 state
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const masterFileRef = useRef<HTMLInputElement>(null);

  // Step 3 state
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyers, setSelectedBuyers] = useState<Set<number>>(new Set());
  const [sendInvites, setSendInvites] = useState(true);

  useEffect(() => {
    if (step === 3) {
      api.get("/auth/buyers").then((r) => setBuyers(r.data.filter((b: Buyer) => b.is_active))).catch(() => {});
    }
  }, [step]);

  function clearError() { setError(""); }

  // Step 1: Create round
  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (form.commodity === CUSTOM_VALUE && !customCommodity.trim()) {
      setError("Please enter a commodity name.");
      return;
    }
    if (form.submission_deadline) {
      const dl = new Date(form.submission_deadline);
      if (isNaN(dl.getTime())) {
        setError("Invalid deadline date. Please enter a valid date and time.");
        return;
      }
      if (dl <= new Date()) {
        setError("Submission deadline must be in the future.");
        return;
      }
    }
    setWorking(true);
    clearError();
    try {
      const resolvedCommodity = form.commodity === CUSTOM_VALUE ? customCommodity.trim() : form.commodity;
      const payload = {
        ...form,
        commodity: resolvedCommodity,
        customer: form.customer || null,
        notes: form.notes || null,
        submission_deadline: form.submission_deadline ? new Date(form.submission_deadline).toISOString() : null,
        auto_send_invites: sendInvites,
      };
      const res = await api.post("/rounds/", payload);
      setRoundId(res.data.id);
      setRoundName(res.data.name);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create round");
    } finally {
      setWorking(false);
    }
  }

  // Step 2: Upload master file
  async function uploadMaster(file: File) {
    if (!roundId) return;
    setWorking(true);
    clearError();
    const fd = new FormData();
    fd.append("file", file);
    try {
      // Large workbooks take much longer to parse on the hosted (shared-CPU) backend than the
      // default client timeout allowed, so uploads get their own generous timeout. The backend
      // keeps the connection alive for 120s.
      const res = await api.post(`/rounds/${roundId}/master-file`, fd, { timeout: 180000 });
      setMasterCount(res.data.total);
      setMasterFile(file);
    } catch (err: any) {
      // Only blame the file format when the server actually said so. A timeout or a dropped
      // connection returns no response body — reporting that as "check file format" sent us
      // hunting a non-existent problem with a perfectly valid file.
      const detail = err.response?.data?.detail;
      if (detail) {
        setError(detail);
      } else if (err.code === "ECONNABORTED") {
        setError("Upload timed out while the server was processing this file. Large files can take a minute — please try again.");
      } else if (!err.response) {
        setError("Cannot reach the server. Check your connection and try again.");
      } else {
        setError(`Upload failed (error ${err.response.status}). Please try again.`);
      }
    } finally {
      setWorking(false);
    }
  }

  function handleMasterDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadMaster(file);
  }

  // Step 3: Assign buyers
  async function handleStep3() {
    if (!roundId) return;
    setWorking(true);
    clearError();
    try {
      const ids = Array.from(selectedBuyers);
      if (ids.length > 0) {
        await api.post(`/rounds/${roundId}/buyers`, { buyer_ids: ids, send_invites: sendInvites });
        setAssignedBuyerIds(ids);
      }
      setStep(4);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to assign buyers");
    } finally {
      setWorking(false);
    }
  }

  // Step 4: Open round
  async function handleOpen() {
    if (!roundId) return;
    setWorking(true);
    clearError();
    try {
      await api.post(`/rounds/${roundId}/open`);
      router.push(`/admin/rounds/${roundId}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to open round");
    } finally {
      setWorking(false);
    }
  }

  function toggleBuyer(id: number) {
    setSelectedBuyers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const card: React.CSSProperties = {
    background: "var(--bg-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xl)",
    padding: "32px",
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: "560px" }} className="animate-in">
        <Link href="/admin/rounds" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Bid Rounds
        </Link>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 28px" }}>
          New Bid Round
        </h1>

        <StepIndicator current={step} total={4} />

        {error && (
          <div style={{
            padding: "10px 14px", marginBottom: "16px",
            background: "var(--danger-dim)", border: "1px solid var(--danger-dim)",
            borderRadius: "9px", fontSize: "0.83rem", color: "var(--danger)",
          }}>
            {error}
          </div>
        )}

        {/* STEP 1: Round details */}
        {step === 1 && (
          <form onSubmit={handleStep1} style={{ ...card, display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <p style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.95rem", margin: "0 0 20px" }}>Round Details</p>
            </div>

            <div>
              <label style={labelStyle}>Round Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. May 2026 Round 2 — Laptops"
                className="glass-input"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Commodity *</label>
                <select
                  value={form.commodity}
                  onChange={(e) => {
                    setForm({ ...form, commodity: e.target.value });
                    if (e.target.value !== CUSTOM_VALUE) setCustomCommodity("");
                  }}
                  className="glass-input"
                >
                  {COMMODITIES.map((c) => (
                    <option key={c} value={c} style={{ textTransform: "capitalize" }}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                  <option value={CUSTOM_VALUE}>+ Enter custom...</option>
                </select>
                {form.commodity === CUSTOM_VALUE && (
                  <input
                    value={customCommodity}
                    onChange={(e) => setCustomCommodity(e.target.value)}
                    placeholder="e.g. Rugged tablets, Smart TVs..."
                    className="glass-input"
                    style={{ marginTop: "8px" }}
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label style={labelStyle}>Customer (optional)</label>
                <input
                  value={form.customer}
                  onChange={(e) => setForm({ ...form, customer: e.target.value })}
                  placeholder="e.g. Acme Corp"
                  className="glass-input"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Due Date <span style={{ color: "var(--text-4)", fontWeight: 400 }}>(bids close at this time)</span></label>
              <input
                type="datetime-local"
                value={form.submission_deadline}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setForm({ ...form, submission_deadline: e.target.value })}
                className="glass-input"
              />
            </div>

            <div>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="glass-input"
                style={{ resize: "vertical" }}
                placeholder="Internal notes, instructions for buyers, etc."
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.reserve_price_enabled}
                onChange={(e) => setForm({ ...form, reserve_price_enabled: e.target.checked })}
                style={{ width: "16px", height: "16px", accentColor: "var(--brand)" }}
              />
              <span style={{ fontSize: "0.85rem", color: "var(--text-2)" }}>
                Enable reserve price floor
                <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-4)", fontWeight: 400 }}>
                  Set a minimum acceptable price per item; bids below it can’t win without an admin override.
                </span>
              </span>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.auto_approve_enabled}
                onChange={(e) => setForm({ ...form, auto_approve_enabled: e.target.checked })}
                style={{ width: "16px", height: "16px", accentColor: "var(--brand)", marginTop: "3px" }}
              />
              <span style={{ fontSize: "0.85rem", color: "var(--text-2)" }}>
                Auto-approve results when clean
                <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-4)", fontWeight: 400 }}>
                  If processing finishes with <strong>no exceptions</strong>, automatically approve every deal and email buyers their results — no manual approval step. A round with any exception always stops for your review.
                </span>
                <span style={{ display: "block", fontSize: "0.72rem", color: "var(--warning)", fontWeight: 400, marginTop: "2px" }}>
                  ⚠ Those buyer emails send automatically and can’t be recalled. Leave off if you want to review first.
                </span>
              </span>
            </label>

            <button type="submit" disabled={working} className="btn-brand" style={{ width: "100%", padding: "12px", fontSize: "0.9rem" }}>
              {working ? "Creating..." : "Continue →"}
            </button>
          </form>
        )}

        {/* STEP 2: Upload master file */}
        {step === 2 && (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: "20px" }}>
            <p style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.95rem", margin: 0 }}>Upload Master File</p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
              Upload the Excel/CSV containing all line items buyers will bid on. Required columns: Part Number, Description, Quantity.
            </p>

            {masterCount != null ? (
              <div style={{
                background: "var(--success-dim)", border: "1px solid var(--success-dim)",
                borderRadius: "12px", padding: "18px 20px",
                display: "flex", alignItems: "center", gap: "14px",
              }}>
                <span style={{ fontSize: "1.5rem" }}>✓</span>
                <div>
                  <p style={{ fontWeight: 600, color: "var(--success)", margin: "0 0 3px" }}>{masterCount.toLocaleString()} line items loaded</p>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-4)", margin: 0 }}>{masterFile?.name}</p>
                </div>
                <button
                  onClick={() => { setMasterCount(null); setMasterFile(null); }}
                  style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Re-upload
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleMasterDrop}
                onClick={() => masterFileRef.current?.click()}
                style={{
                  border: `1px dashed ${dragOver ? "var(--brand-dim)" : "var(--border-mid)"}`,
                  borderRadius: "14px",
                  padding: "40px 24px",
                  textAlign: "center",
                  cursor: working ? "default" : "pointer",
                  background: dragOver ? "var(--brand-dim)" : "transparent",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "10px" }}>{working ? "⏳" : "📋"}</div>
                <p style={{ color: "var(--text-2)", fontSize: "0.88rem", margin: "0 0 6px", fontWeight: 500 }}>
                  {working ? "Parsing file..." : "Drop master file here"}
                </p>
                <p style={{ color: "var(--text-4)", fontSize: "0.75rem", margin: 0 }}>
                  Excel, CSV, PDF, Word · Part Number column required · auto-detects layout
                </p>
                <input
                  ref={masterFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.docx,.doc"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMaster(f); }}
                />
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-4)" }}>Don't have a file?</span>
              <button
                onClick={() => {
                  const csv = [
                    "Part Number,Description,Manufacturer,Quantity,Reserve Price,Category",
                    "CISCO-C9300-48P,Catalyst 9300 48-port PoE+,Cisco,10,1500.00,Networking",
                    "DELL-R750-2U,PowerEdge R750 2U Server,Dell,5,4000.00,Servers",
                    "HPE-DL380-G10,ProLiant DL380 Gen10,HPE,3,3500.00,Servers",
                  ].join("\n");
                  const a = Object.assign(document.createElement("a"), {
                    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
                    download: "master_template_sample.csv",
                  });
                  a.click();
                }}
                style={{ fontSize: "0.72rem", color: "var(--info)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Download sample CSV template
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep(1)} className="btn-ghost" style={{ padding: "10px 20px" }}>← Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={masterCount == null}
                className="btn-brand"
                style={{ flex: 1, padding: "10px" }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Assign buyers */}
        {step === 3 && (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.95rem", margin: 0 }}>Assign Buyers</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-4)" }}>
                  {selectedBuyers.size} of {buyers.length} selected
                </span>
                {buyers.length > 0 && (
                  <button
                    onClick={() => setSelectedBuyers(
                      selectedBuyers.size === buyers.length
                        ? new Set()
                        : new Set(buyers.map((b) => b.id))
                    )}
                    style={{ fontSize: "0.75rem", color: "var(--info)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {selectedBuyers.size === buyers.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>
            </div>

            {buyers.length === 0 ? (
              <p style={{ color: "var(--text-4)", fontSize: "0.85rem" }}>No active buyers found. You can assign buyers later from the round page.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "280px", overflowY: "auto" }}>
                {buyers.map((b) => (
                  <label
                    key={b.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 14px", borderRadius: "10px", cursor: "pointer",
                      background: selectedBuyers.has(b.id) ? "var(--brand-dim)" : "var(--surface)",
                      border: `1px solid ${selectedBuyers.has(b.id) ? "var(--brand-dim)" : "var(--border)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBuyers.has(b.id)}
                      onChange={() => toggleBuyer(b.id)}
                      style={{ width: "15px", height: "15px", accentColor: "var(--brand)", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 500, color: "var(--text-1)", margin: 0, fontSize: "0.85rem" }}>{b.full_name}</p>
                      <p style={{ color: "var(--text-3)", margin: 0, fontSize: "0.75rem" }}>
                        {b.company_name} · {b.email}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", marginTop: "4px" }}>
              <input
                type="checkbox"
                checked={sendInvites}
                onChange={(e) => setSendInvites(e.target.checked)}
                style={{ width: "15px", height: "15px", accentColor: "var(--brand)" }}
              />
              <span style={{ fontSize: "0.82rem", color: "var(--text-3)" }}>
                Send invitation emails to selected buyers when round opens
              </span>
            </label>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep(2)} className="btn-ghost" style={{ padding: "10px 20px" }}>← Back</button>
              <button
                onClick={handleStep3}
                disabled={working}
                className="btn-brand"
                style={{ flex: 1, padding: "10px" }}
              >
                {working ? "Saving..." : "Continue →"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Confirm & Open */}
        {step === 4 && (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: "20px" }}>
            <p style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.95rem", margin: 0 }}>Review & Open</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: "Round Name", value: roundName },
                { label: "Commodity", value: form.commodity === CUSTOM_VALUE ? customCommodity.trim() || "—" : form.commodity },
                { label: "Customer", value: form.customer || "—" },
                { label: "Deadline", value: form.submission_deadline ? fmtDatetime(form.submission_deadline) : "None" },
                { label: "Master Items", value: masterCount != null ? `${masterCount.toLocaleString()} line items` : "—" },
                { label: "Buyers Assigned", value: assignedBuyerIds.length > 0 ? `${assignedBuyerIds.length} buyer${assignedBuyerIds.length > 1 ? "s" : ""}` : "None (add later)" },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--surface)",
                  borderRadius: "8px",
                }}>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-4)" }}>{label}</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-1)", fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{
              padding: "12px 16px",
              background: "var(--orange-dim)",
              border: "1px solid var(--orange-dim)",
              borderRadius: "10px",
              fontSize: "0.8rem",
              color: "var(--warning-dim)",
            }}>
              Opening the round makes it live and visible to assigned buyers. This action cannot be undone — ensure everything is correct before proceeding.
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setStep(3)} className="btn-ghost" style={{ padding: "10px 20px" }}>← Back</button>
              <button
                onClick={handleOpen}
                disabled={working}
                className="btn-brand"
                style={{ flex: 1, padding: "10px", background: "var(--success-strong)" }}
              >
                {working ? "Opening..." : "Open Round"}
              </button>
            </div>

            <button
              onClick={() => router.push(`/admin/rounds/${roundId}`)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: "0.78rem", textDecoration: "underline" }}
            >
              Save as draft and configure later
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
