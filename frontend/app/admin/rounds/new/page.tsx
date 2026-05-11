"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

const COMMODITIES = ["laptops", "desktops", "servers", "networking", "storage", "peripherals", "other"];

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 500,
  color: "rgba(255,255,255,0.55)",
  marginBottom: "8px",
};

export default function NewRound() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    commodity: "laptops",
    notes: "",
    submission_deadline: "",
    reserve_price_enabled: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        submission_deadline: form.submission_deadline
          ? new Date(form.submission_deadline).toISOString()
          : null,
      };
      const res = await api.post("/rounds/", payload);
      router.push(`/admin/rounds/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create round");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "540px" }}>
        <Link href="/admin" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Back
        </Link>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "12px 0 28px" }}>
          New Bid Round
        </h2>

        <form onSubmit={submit} style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}>
          <div>
            <label style={labelStyle}>Round Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. May 2026 Round 2 — Laptops"
              className="glass-input"
            />
          </div>

          <div>
            <label style={labelStyle}>Commodity</label>
            <select
              value={form.commodity}
              onChange={(e) => setForm({ ...form, commodity: e.target.value })}
              className="glass-input"
              style={{ appearance: "none" }}
            >
              {COMMODITIES.map((c) => (
                <option key={c} value={c} style={{ textTransform: "capitalize" }}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Submission Deadline</label>
            <input
              type="datetime-local"
              value={form.submission_deadline}
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
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.reserve_price_enabled}
              onChange={(e) => setForm({ ...form, reserve_price_enabled: e.target.checked })}
              style={{ width: "16px", height: "16px", accentColor: "#3D81E3" }}
            />
            <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)" }}>Enable reserve price floor</span>
          </label>

          {error && (
            <div style={{
              padding: "10px 14px",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "9px",
              fontSize: "0.83rem",
              color: "#f87171",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-brand"
            style={{ width: "100%", padding: "13px", fontSize: "0.95rem", borderRadius: "12px" }}
          >
            {loading ? "Creating..." : "Create Round"}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
