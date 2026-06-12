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
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(null);
  const [resending, setResending] = useState<number | null>(null);

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
      setNewCredentials({ email: res.data.email, password: res.data.temp_password });
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

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.72rem", fontWeight: 700,
    color: "var(--text-4)", marginBottom: "6px",
    textTransform: "uppercase", letterSpacing: "0.06em",
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: "960px" }} className="animate-in">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>Buyers</h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
              {buyers.length} buyer{buyers.length !== 1 ? "s" : ""} · <span style={{ color: "#34d399" }}>{buyers.filter((b) => b.is_active).length} active</span>
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className={showForm ? "btn-ghost" : "btn-brand"}>
            {showForm ? "Cancel" : (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Buyer</>
            )}
          </button>
        </div>

        {/* Flash message */}
        {msg && (
          <div style={{
            marginBottom: "16px", padding: "11px 16px", borderRadius: "10px", fontSize: "0.83rem",
            background: msgType === "ok" ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: msgType === "ok" ? "#34d399" : "#f87171",
          }}>
            {msg}
          </div>
        )}

        {/* New buyer credentials — always shown until dismissed */}
        {newCredentials && (
          <div style={{
            marginBottom: "20px", padding: "20px 22px", borderRadius: "14px",
            background: "rgba(61,129,227,0.08)", border: "1px solid rgba(61,129,227,0.3)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#60a5fa", margin: 0 }}>
                ✓ Credentials ready — share these with the buyer
              </p>
              <button onClick={() => setNewCredentials(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontFamily: "monospace", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "rgba(255,255,255,0.4)", width: "70px", fontFamily: "inherit", fontSize: "0.75rem" }}>Email</span>
                <span style={{ color: "var(--text-1)", background: "rgba(255,255,255,0.07)", padding: "4px 10px", borderRadius: "6px" }}>{newCredentials.email}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "rgba(255,255,255,0.4)", width: "70px", fontFamily: "inherit", fontSize: "0.75rem" }}>Password</span>
                <span style={{ color: "#34d399", background: "rgba(52,211,153,0.08)", padding: "4px 10px", borderRadius: "6px", letterSpacing: "0.05em" }}>{newCredentials.password}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(newCredentials.password).then(() => flash("✓ Password copied"))}
                  style={{ fontSize: "0.72rem", color: "#60a5fa", background: "none", border: "1px solid rgba(61,129,227,0.3)", borderRadius: "5px", padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Copy
                </button>
              </div>
            </div>
            <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", margin: "10px 0 0" }}>
              Share these credentials with the buyer. An email was also attempted (if email is configured).
            </p>
          </div>
        )}

        {/* Create buyer form */}
        {showForm && (
          <form onSubmit={createBuyer} style={{
            background: "var(--bg-2)",
            border: "1px solid rgba(61,129,227,0.25)",
            borderRadius: "var(--radius-xl)",
            padding: "24px",
            marginBottom: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>New Buyer</p>
              <span style={{ fontSize: "0.72rem", color: "rgba(52,211,153,0.8)", display: "flex", alignItems: "center", gap: "5px" }}>
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
                  <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
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
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : loadError ? (
          <div style={{ textAlign: "center", paddingTop: "60px" }}>
            <p style={{ color: "#f87171", fontSize: "0.9rem", marginBottom: "12px" }}>Failed to load buyers.</p>
            <button onClick={load} className="btn-ghost" style={{ fontSize: "0.82rem" }}>Retry</button>
          </div>
        ) : buyers.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "64px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>👤</div>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>No buyers yet</p>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>Add your first buyer using the button above.</p>
          </div>
        ) : (
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
          }}>
            <table className="dark-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th style={{ textAlign: "center" }}>Fluff %</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500, color: "var(--text-1)" }}>{b.full_name}</td>
                    <td>{b.company_name || "—"}</td>
                    <td style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>{b.email}</td>

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
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(61,129,227,0.4)",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              color: "var(--text-1)",
                              fontSize: "0.8rem",
                              outline: "none",
                            }}
                          />
                          <button aria-label="Save fluff percentage" onClick={() => saveFluff(b.id)} style={{ fontSize: "0.72rem", color: "#34d399", background: "none", border: "none", cursor: "pointer" }}>✓</button>
                          <button aria-label="Cancel fluff edit" onClick={() => setEditingFluff(null)} style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                        </div>
                      ) : (
                        <button
                          aria-label={`Edit fluff percentage for ${b.full_name}`}
                          onClick={() => { setEditingFluff(b.id); setFluffValue(String(b.fluff_percentage)); }}
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "6px",
                            padding: "3px 10px",
                            fontSize: "0.8rem",
                            color: "rgba(255,255,255,0.7)",
                            cursor: "pointer",
                          }}
                        >
                          {b.fluff_percentage}%
                        </button>
                      )}
                    </td>

                    {/* Status badge */}
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
                            background: b.is_active ? "rgba(239,68,68,0.1)" : "rgba(52,211,153,0.1)",
                            color: b.is_active ? "#f87171" : "#34d399",
                            border: `1px solid ${b.is_active ? "rgba(239,68,68,0.2)" : "rgba(52,211,153,0.2)"}`,
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
                            background: "rgba(61,129,227,0.1)", color: "#60a5fa",
                            border: "1px solid rgba(61,129,227,0.2)",
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
                            background: "rgba(239,68,68,0.08)", color: "#f87171",
                            border: "1px solid rgba(239,68,68,0.2)",
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
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
