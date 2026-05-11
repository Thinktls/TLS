"use client";
import { useEffect, useState, useRef } from "react";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";

interface Round {
  id: number;
  name: string;
  commodity: string;
  deadline: string | null;
}

export default function SubmitBid() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get("/buyer/rounds").then((r) => setRounds(r.data));
  }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedRound) return;
    setUploading(true);
    setMsg("");
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/buyer/rounds/${selectedRound}/bid`, fd);
      setMsg(`✓ Submitted ${res.data.total_lines || "your"} line items — thank you!`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed. Check your file format.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <BuyerLayout>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
        Submit a Bid
      </h2>
      <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
        Upload your pricing file for an open bid round.
      </p>

      {rounds.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
          No open rounds right now. Check back soon.
        </div>
      ) : (
        <div style={{ maxWidth: "520px" }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "18px",
            padding: "28px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}>
            {/* Round selector */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: "8px" }}>
                Select Bid Round
              </label>
              <select
                value={selectedRound ?? ""}
                onChange={(e) => setSelectedRound(Number(e.target.value))}
                className="glass-input"
                style={{ appearance: "none" }}
              >
                <option value="">— Select a round —</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.commodity})</option>
                ))}
              </select>
              {selectedRound && rounds.find((r) => r.id === selectedRound)?.deadline && (
                <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", marginTop: "6px" }}>
                  Deadline: {new Date(rounds.find((r) => r.id === selectedRound)!.deadline!).toLocaleString()}
                </p>
              )}
            </div>

            {/* Drop zone */}
            <div style={{
              border: "1px dashed rgba(255,255,255,0.15)",
              borderRadius: "14px",
              padding: "36px 24px",
              textAlign: "center",
            }}>
              <p style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.5)", marginBottom: "8px" }}>
                Drop your pricing file here or click to browse
              </p>
              <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", marginBottom: "20px" }}>
                Supported: .xlsx, .xls, .csv — must include Part Number and Unit Price columns
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={upload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!selectedRound || uploading}
                className="btn-brand"
                style={{ padding: "10px 28px" }}
              >
                {uploading ? "Uploading..." : "Choose File"}
              </button>
            </div>

            {msg && (
              <div style={{
                padding: "11px 16px",
                background: "rgba(52,211,153,0.12)",
                border: "1px solid rgba(52,211,153,0.25)",
                borderRadius: "10px",
                fontSize: "0.83rem",
                color: "#34d399",
              }}>
                {msg}
              </div>
            )}
            {error && (
              <div style={{
                padding: "11px 16px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "10px",
                fontSize: "0.83rem",
                color: "#f87171",
              }}>
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </BuyerLayout>
  );
}
