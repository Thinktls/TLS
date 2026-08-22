"use client";
import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";

interface Buyer {
  id: number;
  full_name: string;
  company_name: string;
  email: string;
  is_active: boolean;
  fluff_percentage: number;
  fluff_enabled: boolean;
}

function FluffRow({ buyer, onSave }: { buyer: Buyer; onSave: (id: number, pct: number, enabled: boolean) => Promise<void> }) {
  const [pct, setPct] = useState(buyer.fluff_percentage ?? 3.5);
  const [enabled, setEnabled] = useState(buyer.fluff_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = pct !== buyer.fluff_percentage || enabled !== buyer.fluff_enabled;

  // Sync local state when parent updates the buyer record (e.g. after save or bulk apply)
  useEffect(() => {
    setPct(buyer.fluff_percentage ?? 3.5);
    setEnabled(buyer.fluff_enabled ?? true);
  }, [buyer.fluff_percentage, buyer.fluff_enabled]);

  async function save() {
    setSaving(true);
    await onSave(buyer.id, pct, enabled);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const previewPrice = 1000;
  const fluffedPrice = enabled ? previewPrice * (1 + pct / 100) : previewPrice;

  return (
    <tr>
      <td style={{ padding: "14px 16px" }}>
        <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "0.88rem" }}>{buyer.company_name || buyer.full_name}</div>
        <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{buyer.email}</div>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <span style={{
          padding: "3px 10px",
          borderRadius: "100px",
          fontSize: "0.72rem",
          fontWeight: 600,
          background: buyer.is_active ? "var(--success-dim)" : "var(--danger-dim)",
          color: buyer.is_active ? "var(--success)" : "var(--danger)",
        }}>
          {buyer.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Toggle */}
          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              width: "36px",
              height: "20px",
              borderRadius: "100px",
              border: "none",
              cursor: "pointer",
              position: "relative",
              background: enabled ? "var(--brand)" : "var(--surface-hover)",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute",
              top: "3px",
              left: enabled ? "18px" : "3px",
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "var(--text-1)",
              transition: "left 0.2s",
            }} />
          </button>
          <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>
            {enabled ? "On" : "Off"}
          </span>
        </div>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={pct}
            onChange={e => setPct(parseFloat(e.target.value) || 0)}
            disabled={!enabled}
            style={{
              width: "80px",
              background: "var(--surface)",
              border: "1px solid var(--border-mid)",
              borderRadius: "8px",
              color: enabled ? "var(--text-1)" : "var(--text-4)",
              padding: "6px 10px",
              fontSize: "0.875rem",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <span style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>%</span>
        </div>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
          If real price = $1,000 →{" "}
          <span style={{ color: enabled ? "var(--warning)" : "var(--text-4)", fontWeight: 600 }}>
            ${fluffedPrice.toFixed(2)}
          </span>
          {enabled && pct > 0 && (
            <span style={{ color: "var(--text-4)", marginLeft: "4px" }}>
              (+{pct}%)
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: "14px 16px" }}>
        {dirty ? (
          <button
            className="btn-brand"
            onClick={save}
            disabled={saving}
            style={{ padding: "6px 16px", fontSize: "0.8rem" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : saved ? (
          <span style={{ color: "var(--success)", fontSize: "0.8rem", fontWeight: 600 }}>✓ Saved</span>
        ) : (
          <span style={{ color: "var(--text-4)", fontSize: "0.8rem" }}>—</span>
        )}
      </td>
    </tr>
  );
}

export default function FluffSettingsPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [globalPct, setGlobalPct] = useState<number | "">("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Buyer[]>("/auth/buyers");
      setBuyers(data.data);
    } catch {
      setError("Failed to load buyers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveSingle(id: number, pct: number, enabled: boolean) {
    // Single combined request — was two sequential calls (slow on cold start)
    await api.patch(`/auth/buyers/${id}/fluff-settings`, { fluff_percentage: pct, fluff_enabled: enabled });
    setBuyers(prev => prev.map(b => b.id === id ? { ...b, fluff_percentage: pct, fluff_enabled: enabled } : b));
  }

  async function applyGlobalFluff() {
    if (globalPct === "") return;
    setBulkSaving(true);
    try {
      await Promise.all(buyers.map(b => api.patch(`/auth/buyers/${b.id}/fluff`, null, { params: { fluff_percentage: globalPct } })));
      setBuyers(prev => prev.map(b => ({ ...b, fluff_percentage: globalPct as number })));
      setGlobalPct("");
    } catch {
      setError("Bulk update failed");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="page-shell animate-in">
        {/* Header */}
        <div className="page-header">
          <div className="page-header-text">
            <p className="page-eyebrow">Buyers</p>
            <h1 className="page-title">Fluff Engine Settings</h1>
            <p className="page-subtitle">
              Configure the price obfuscation percentage each losing buyer sees on their loss notice.
              The real winning price is never revealed directly.
            </p>
          </div>
        </div>

        {/* Info callout */}
        <div style={{
          background: "var(--brand-dim)",
          border: "1px solid var(--brand-dim)",
          borderRadius: "10px",
          padding: "14px 18px",
          marginBottom: "24px",
          fontSize: "0.85rem",
          color: "var(--text-2)",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "1rem", flexShrink: 0 }}>ℹ️</span>
          <div>
            <strong style={{ color: "var(--text-1)" }}>How it works:</strong> When a buyer loses, their award sheet shows
            <em> fluffed_loss_price = winner_price × (1 + fluff%) </em>
            instead of the real winning price. This protects pricing intelligence while still informing the loser how far off they were.
          </div>
        </div>

        {/* Bulk setter */}
        <div className="glass" style={{ borderRadius: "12px", padding: "18px 20px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <span style={{ color: "var(--text-2)", fontSize: "0.875rem", fontWeight: 500 }}>
            Apply to all buyers:
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              placeholder="e.g. 5"
              value={globalPct}
              onChange={e => setGlobalPct(parseFloat(e.target.value) || "")}
              style={{
                width: "90px",
                background: "var(--surface)",
                border: "1px solid var(--border-mid)",
                borderRadius: "8px",
                color: "var(--text-1)",
                padding: "7px 10px",
                fontSize: "0.875rem",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <span style={{ color: "var(--text-3)" }}>%</span>
          </div>
          <button
            className="btn-brand"
            onClick={applyGlobalFluff}
            disabled={bulkSaving || globalPct === ""}
            style={{ padding: "8px 18px", fontSize: "0.82rem" }}
          >
            {bulkSaving ? "Applying…" : "Apply to All"}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "40px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ color: "var(--danger)", padding: "20px", textAlign: "center" }}>{error}</div>
        ) : buyers.length === 0 ? (
          <div className="glass" style={{ borderRadius: "12px", padding: "48px", textAlign: "center" }}>
            <p style={{ color: "var(--text-3)" }}>No buyers registered yet.</p>
          </div>
        ) : (
          <div className="glass dark-table-wrapper" style={{ borderRadius: "12px", overflow: "hidden" }}>
            <table className="dark-table" style={{ minWidth: "700px" }}>
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Status</th>
                  <th>Fluff Enabled</th>
                  <th>Fluff %</th>
                  <th>Preview</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {buyers.map(b => (
                  <FluffRow key={b.id} buyer={b} onSave={saveSingle} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
