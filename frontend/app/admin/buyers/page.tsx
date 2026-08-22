"use client";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";

interface Buyer {
  id: number;
  email: string;
  full_name: string;
  company_name: string;
  fluff_percentage: number;
  is_active: boolean;
  role: string;
  last_login: string | null;
  last_bid_at: string | null;
  created_at: string | null;
}

interface NewBuyerForm {
  email: string;
  full_name: string;
  company_name: string;
  fluff_percentage: number;
  password: string;
}

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [editingFluff, setEditingFluff] = useState<number | null>(null);
  const [fluffValue, setFluffValue] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string; emailError?: string | null } | null>(null);
  const [resending, setResending] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  const [form, setForm] = useState<NewBuyerForm>({
    email: "",
    full_name: "",
    company_name: "",
    fluff_percentage: 3.5,
    password: "",
  });
  const [deleting, setDeleting] = useState<number | null>(null);

  async function load() {
    setLoadError(false);
    try {
      const res = await api.get("/auth/buyers");
      setBuyers(res.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 3500);
  }

  async function createBuyer(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post("/auth/buyers", { ...form, role: "buyer" });
      setNewCredentials({ email: res.data.email, password: res.data.temp_password, emailError: res.data.email_error });
      setShowForm(false);
      setForm({ email: "", full_name: "", company_name: "", fluff_percentage: 3.5, password: "" });
      load();
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to create buyer", "err");
    } finally {
      setCreating(false);
    }
  }

  async function deleteBuyer(id: number, name: string) {
    if (!confirm(`Delete buyer "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/auth/buyers/${id}`);
      flash(`✓ Buyer "${name}" deleted`);
      load();
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to delete buyer", "err");
    } finally {
      setDeleting(null);
    }
  }

  async function resendCredentials(id: number) {
    setResending(id);
    try {
      const res = await api.post(`/auth/buyers/${id}/send-invite`);
      setNewCredentials({ email: res.data.email, password: res.data.temp_password });
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to resend credentials", "err");
    } finally {
      setResending(null);
    }
  }

  async function sendTestEmail(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true); setTestResult(null);
    try {
      const res = await api.post("/auth/email-test", { to_email: testEmail });
      const r = res.data.result; const c = res.data.config;
      if (r.ok) {
        setTestResult({ ok: true, text: `✓ Sent via ${r.provider}. Check ${testEmail} (incl. spam).` });
      } else {
        setTestResult({ ok: false, text: `✗ Provider: ${c.active_provider}. Failed: ${r.detail}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, text: err.response?.data?.detail || "Test request failed" });
    } finally {
      setTesting(false);
    }
  }

  async function toggleBuyer(id: number) {
    setToggling(id);
    try {
      await api.patch(`/auth/buyers/${id}/toggle`);
      load();
    } finally {
      setToggling(null);
    }
  }

  async function saveFluff(id: number) {
    const pct = parseFloat(fluffValue);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      flash("Fluff must be between 0 and 100", "err");
      return;
    }
    try {
      await api.patch(`/auth/buyers/${id}/fluff`, null, { params: { fluff_percentage: pct } });
      // Optimistic update — reflect immediately without waiting for full reload
      setBuyers((prev) => prev.map((b) => b.id === id ? { ...b, fluff_percentage: pct } : b));
      flash(`✓ Fluff updated to ${pct}%`);
      setEditingFluff(null);
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to update fluff", "err");
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? buyers.filter(b =>
        (b.company_name || "").toLowerCase().includes(q) ||
        b.full_name.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q))
    : buyers;
  const signedInCount = buyers.filter(b => b.last_login).length;

  function fmtDate(s: string | null): string {
    if (!s) return "";
    try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch { return ""; }
  }

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.72rem", fontWeight: 700,
    color: "var(--text-4)", marginBottom: "6px",
    textTransform: "uppercase", letterSpacing: "0.06em",
  };

  return (
    <AdminLayout>
      <div className="page-shell animate-in">
        {/* Header */}
        <div className="page-header">
          <div className="page-header-text">
            <p className="page-eyebrow">Buyers</p>
            <h1 className="page-title">Buyers</h1>
            <p className="page-subtitle">
              {buyers.length} buyer{buyers.length !== 1 ? "s" : ""} · <span style={{ color: "var(--success)" }}>{signedInCount} signed in</span>
            </p>
          </div>
          <div className="page-actions">
            <button onClick={() => setShowDiag(!showDiag)} className="btn-ghost" title="Diagnose email delivery">
              ✉ Email check
            </button>
            <button onClick={() => setShowForm(!showForm)} className={showForm ? "btn-ghost" : "btn-brand"}>
              {showForm ? "Cancel" : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Buyer</>
              )}
            </button>
          </div>
        </div>

        {/* Email diagnostics — send a real test email and see the actual result/error */}
        {showDiag && (
          <div style={{ marginBottom: "20px", padding: "18px 20px", borderRadius: "14px", background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Email delivery test</p>
            <p style={{ fontSize: "0.78rem", color: "var(--text-4)", margin: "0 0 12px" }}>
              Send a real test email to any address and see whether it sends (and the exact error if it doesn&apos;t).
            </p>
            <form onSubmit={sendTestEmail} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="glass-input"
                style={{ flex: 1, minWidth: "240px" }}
              />
              <button type="submit" disabled={testing} className="btn-brand">
                {testing ? "Sending…" : "Send test"}
              </button>
            </form>
            {testResult && (
              <div style={{
                marginTop: "12px", padding: "10px 14px", borderRadius: "8px", fontSize: "0.82rem",
                background: testResult.ok ? "var(--success-bg)" : "var(--danger-bg)",
                border: `1px solid ${testResult.ok ? "var(--success-border)" : "var(--danger-border)"}`,
                color: testResult.ok ? "var(--success)" : "var(--danger)", wordBreak: "break-word",
              }}>
                {testResult.text}
              </div>
            )}
          </div>
        )}

        {/* Flash message */}
        {msg && (
          <div style={{
            marginBottom: "16px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            border: `1px solid ${msgType === "ok" ? "var(--success-border)" : "var(--danger-border)"}`,
            color: msgType === "ok" ? "var(--success)" : "var(--danger)",
          }}>
            {msg}
          </div>
        )}

        {/* New buyer credentials — always shown until dismissed */}
        {newCredentials && (
          <div style={{
            marginBottom: "20px", padding: "20px 22px", borderRadius: "14px",
            background: "var(--info-bg)", border: "1px solid var(--info-border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--info)", margin: 0 }}>
                ✓ Credentials ready — share these with the buyer
              </p>
              <button onClick={() => setNewCredentials(null)} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontFamily: "monospace", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "var(--text-3)", width: "70px", fontFamily: "inherit", fontSize: "0.75rem" }}>Email</span>
                <span style={{ color: "var(--text-1)", background: "var(--surface-hover)", padding: "4px 10px", borderRadius: "6px" }}>{newCredentials.email}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "var(--text-3)", width: "70px", fontFamily: "inherit", fontSize: "0.75rem" }}>Password</span>
                <span style={{ color: "var(--success)", background: "var(--success-bg)", padding: "4px 10px", borderRadius: "6px", letterSpacing: "0.05em" }}>{newCredentials.password}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(newCredentials.password).then(() => flash("✓ Password copied"))}
                  style={{ fontSize: "0.72rem", color: "var(--info)", background: "none", border: "1px solid var(--info-border)", borderRadius: "5px", padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Copy
                </button>
              </div>
            </div>
            {newCredentials.emailError ? (
              <div style={{ marginTop: "12px", padding: "9px 12px", borderRadius: "8px", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: "0.75rem", wordBreak: "break-word" }}>
                ⚠ The invite email did NOT send: {newCredentials.emailError} — share the credentials above manually, and use “✉ Email check” to diagnose.
              </div>
            ) : (
              <p style={{ fontSize: "0.72rem", color: "var(--success)", margin: "10px 0 0" }}>
                ✓ Login credentials were emailed to the buyer.
              </p>
            )}
          </div>
        )}

        {/* Create buyer form */}
        {showForm && (
          <form onSubmit={createBuyer} style={{
            background: "var(--bg-2)",
            border: "1px solid var(--info-border)",
            borderRadius: "var(--radius-xl)",
            padding: "24px",
            marginBottom: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>New Buyer</p>
              <span style={{ fontSize: "0.72rem", color: "var(--success)", display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Login credentials emailed automatically on create
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required placeholder="Jane Smith" className="glass-input" />
              </div>
              <div>
                <label style={labelStyle}>Company</label>
                <input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Acme IT Solutions" className="glass-input" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="jane@company.com" className="glass-input" />
              </div>
              <div>
                <label style={labelStyle}>Fluff % (margin applied to loss notices)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.fluff_percentage}
                  onChange={(e) => setForm({ ...form, fluff_percentage: parseFloat(e.target.value) })}
                  className="glass-input"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>
                  Password&nbsp;
                  <span style={{ color: "var(--text-4)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    — leave blank to auto-generate · buyer can change it from Profile
                  </span>
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Set a temporary password (optional)"
                  minLength={form.password ? 8 : undefined}
                  className="glass-input"
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button type="submit" disabled={creating} className="btn-brand">
                {creating ? "Creating..." : "Create Buyer"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        )}

        {/* Buyers table */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "60px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : loadError ? (
          <div style={{ textAlign: "center", paddingTop: "60px" }}>
            <p style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "12px" }}>Failed to load buyers.</p>
            <button onClick={load} className="btn-ghost" style={{ fontSize: "0.82rem" }}>Retry</button>
          </div>
        ) : buyers.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "64px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>👤</div>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>No buyers yet</p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Add your first buyer using the button above.</p>
          </div>
        ) : (
          <div className="panel" style={{ overflowX: "auto" }}>
            <div className="panel-head">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search buyers by company, name, or email…"
                className="glass-input"
                style={{ width: "100%", maxWidth: "420px" }}
              />
            </div>
            <table className="dark-table" style={{ minWidth: "820px" }}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th style={{ textAlign: "center" }}>Fluff %</th>
                  <th style={{ textAlign: "center" }}>Sign-in</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500, color: "var(--text-1)" }}>{b.company_name || "—"}</td>
                    <td style={{ color: "var(--text-2)" }}>{b.full_name}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>{b.email}</td>

                    {/* Fluff % — inline edit */}
                    <td style={{ textAlign: "center" }}>
                      {editingFluff === b.id ? (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={fluffValue}
                            onChange={(e) => setFluffValue(e.target.value)}
                            style={{
                              width: "64px",
                              background: "var(--surface-hover)",
                              border: "1px solid var(--info-border)",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              color: "var(--text-1)",
                              fontSize: "0.8rem",
                              outline: "none",
                            }}
                          />
                          <button aria-label="Save fluff percentage" onClick={() => saveFluff(b.id)} style={{ fontSize: "0.72rem", color: "var(--success)", background: "none", border: "none", cursor: "pointer" }}>✓</button>
                          <button aria-label="Cancel fluff edit" onClick={() => setEditingFluff(null)} style={{ fontSize: "0.72rem", color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                        </div>
                      ) : (
                        <button
                          aria-label={`Edit fluff percentage for ${b.full_name}`}
                          onClick={() => { setEditingFluff(b.id); setFluffValue(String(b.fluff_percentage)); }}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border-mid)",
                            borderRadius: "6px",
                            padding: "3px 10px",
                            fontSize: "0.8rem",
                            color: "var(--text-2)",
                            cursor: "pointer",
                          }}
                        >
                          {b.fluff_percentage}%
                        </button>
                      )}
                    </td>

                    {/* Sign-in status — has the buyer accepted their invite and logged in? */}
                    <td style={{ textAlign: "center" }}>
                      {b.last_login ? (
                        <span title={`Last sign-in ${fmtDate(b.last_login)}`} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--success)" }}>Signed in</span>
                          <span style={{ fontSize: "0.66rem", color: "var(--text-4)" }}>{fmtDate(b.last_login)}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--warning)" }} title="Invite sent but never signed in">Not yet</span>
                      )}
                    </td>

                    {/* Account status badge */}
                    <td style={{ textAlign: "center" }}>
                      <span className={`badge ${b.is_active ? "badge-open" : "badge-error"}`}>
                        {b.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                        <button
                          aria-label={`${b.is_active ? "Disable" : "Enable"} ${b.full_name}`}
                          onClick={() => toggleBuyer(b.id)}
                          disabled={toggling === b.id}
                          style={{
                            padding: "4px 12px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit",
                            background: b.is_active ? "var(--danger-bg)" : "var(--success-bg)",
                            color: b.is_active ? "var(--danger)" : "var(--success)",
                            border: `1px solid ${b.is_active ? "var(--danger-border)" : "var(--success-border)"}`,
                          }}
                        >
                          {toggling === b.id ? "…" : b.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          aria-label={`Resend login credentials to ${b.full_name}`}
                          onClick={() => resendCredentials(b.id)}
                          disabled={resending === b.id}
                          title="Reset password and resend login credentials"
                          style={{
                            padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit",
                            background: "var(--info-bg)", color: "var(--info)",
                            border: "1px solid var(--info-border)",
                          }}
                        >
                          {resending === b.id ? "…" : "Resend"}
                        </button>
                        <button
                          aria-label={`Delete ${b.full_name}`}
                          onClick={() => deleteBuyer(b.id, b.full_name)}
                          disabled={deleting === b.id}
                          title="Permanently delete this buyer"
                          style={{
                            padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit",
                            background: "var(--danger-bg)", color: "var(--danger)",
                            border: "1px solid var(--danger-border)",
                          }}
                        >
                          {deleting === b.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-4)", fontSize: "0.85rem" }}>
                No buyers match “{search}”.
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
