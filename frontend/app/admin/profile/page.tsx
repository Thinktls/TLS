"use client";
import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";

export default function AdminProfilePage() {
  const [user, setUser] = useState<{ full_name: string; email: string; company_name: string; role: string } | null>(null);
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");

  useEffect(() => {
    api.get("/auth/me").then(r => setUser(r.data)).catch(() => {});
  }, []);

  function flash(text: string, type: "ok" | "err" = "ok") {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirm) { flash("New passwords do not match", "err"); return; }
    if (newPwd.length < 8) { flash("Password must be at least 8 characters", "err"); return; }
    setSaving(true);
    try {
      await api.post("/auth/me/change-password", { current_password: current, new_password: newPwd });
      flash("Password updated successfully");
      setCurrent(""); setNewPwd(""); setConfirm("");
    } catch (err: any) {
      flash(err.response?.data?.detail || "Failed to update password", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "520px" }} className="animate-in">
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>
          Account
        </h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-4)", marginBottom: "28px" }}>
          Your admin account details and password.
        </p>

        {/* Account info */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "16px" }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>Account</p>
          {user ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { label: "Full Name", value: user.full_name },
                { label: "Email", value: user.email },
                { label: "Role", value: user.role },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "12px", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-4)", fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: "0.88rem", color: "var(--text-1)", textTransform: label === "Role" ? "capitalize" : "none" }}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>

        {/* Change password */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px" }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 18px" }}>Change Password</p>

          {msg && (
            <div style={{
              marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "0.82rem",
              background: msgType === "ok" ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${msgType === "ok" ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
              color: msgType === "ok" ? "#34d399" : "#f87171",
            }}>
              {msg}
            </div>
          )}

          <form onSubmit={changePassword} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {[
              { label: "Current Password", value: current, set: setCurrent },
              { label: "New Password", value: newPwd, set: setNewPwd },
              { label: "Confirm New Password", value: confirm, set: setConfirm },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-4)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {label}
                </label>
                <input
                  type="password"
                  value={value}
                  onChange={e => set(e.target.value)}
                  required
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: "10px",
                    border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-1)",
                    fontSize: "0.88rem", outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>
            ))}
            <button type="submit" disabled={saving} className="btn-brand" style={{ marginTop: "4px", alignSelf: "flex-start", padding: "10px 24px" }}>
              {saving ? "Saving…" : "Update Password"}
            </button>
          </form>
          <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: "14px 0 0" }}>
            Forgot your current password? Sign out and use “Forgot password?” on the login page to reset it by email.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
