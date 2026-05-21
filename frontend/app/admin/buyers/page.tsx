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
  password: string;
  fluff_percentage: number;
}

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [editingFluff, setEditingFluff] = useState<number | null>(null);
  const [fluffValue, setFluffValue] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");

  const [form, setForm] = useState<NewBuyerForm>({
    email: "",
    full_name: "",
    company_name: "",
    password: "",
    fluff_percentage: 3.5,
  });

  async function load() {
    const res = await api.get("/auth/buyers");
    setBuyers(res.data);
    setLoading(false);
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
      await api.post("/auth/buyers", { ...form, role: "buyer" });
      flash("✓ Buyer created successfully");
      setShowForm(false);
      setForm({ email: "", full_name: "", company_name: "", password: "", fluff_percentage: 3.5 });
      load();
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to create buyer", "err");
    } finally {
      setCreating(false);
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
    display: "block",
    fontSize: "0.78rem",
    fontWeight: 500,
    color: "rgba(255,255,255,0.5)",
    marginBottom: "6px",
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: "960px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: 0 }}>Buyers</h2>
            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
              {buyers.length} buyer{buyers.length !== 1 ? "s" : ""} · {buyers.filter((b) => b.is_active).length} active
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-brand">
            {showForm ? "Cancel" : "+ Add Buyer"}
          </button>
        </div>

        {/* Flash message */}
        {msg && (
          <div style={{
            marginBottom: "16px",
            padding: "11px 16px",
            borderRadius: "10px",
            fontSize: "0.83rem",
            background: msgType === "ok" ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: msgType === "ok" ? "#34d399" : "#f87171",
          }}>
            {msg}
          </div>
        )}

        {/* Create buyer form */}
        {showForm && (
          <form onSubmit={createBuyer} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(61,129,227,0.25)",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "20px",
          }}>
            <p style={{ fontWeight: 600, color: "white", margin: "0 0 18px", fontSize: "0.95rem" }}>New Buyer</p>
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
                <label style={labelStyle}>Password</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="glass-input" />
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
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: "40px" }}>Loading...</div>
        ) : buyers.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
            No buyers yet. Add one above.
          </div>
        ) : (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
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
                    <td style={{ fontWeight: 500, color: "white" }}>{b.full_name}</td>
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
                              color: "white",
                              fontSize: "0.8rem",
                              outline: "none",
                            }}
                          />
                          <button onClick={() => saveFluff(b.id)} style={{ fontSize: "0.72rem", color: "#34d399", background: "none", border: "none", cursor: "pointer" }}>✓</button>
                          <button onClick={() => setEditingFluff(null)} style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                        </div>
                      ) : (
                        <button
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
                      <span style={{
                        padding: "3px 10px",
                        borderRadius: "100px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        background: b.is_active ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.12)",
                        color: b.is_active ? "#34d399" : "#f87171",
                      }}>
                        {b.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>

                    {/* Toggle action */}
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => toggleBuyer(b.id)}
                        disabled={toggling === b.id}
                        style={{
                          padding: "4px 14px",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          background: b.is_active ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.12)",
                          color: b.is_active ? "#f87171" : "#34d399",
                          border: `1px solid ${b.is_active ? "rgba(239,68,68,0.2)" : "rgba(52,211,153,0.2)"}`,
                        }}
                      >
                        {toggling === b.id ? "..." : b.is_active ? "Disable" : "Enable"}
                      </button>
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
