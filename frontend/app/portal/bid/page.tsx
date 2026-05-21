"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BuyerLayout from "@/components/BuyerLayout";
import api from "@/lib/api";
import { downloadFile } from "@/lib/download";

interface Round {
  id: number;
  name: string;
  commodity: string;
  customer: string | null;
  deadline: string | null;
  invite_status: string | null;
  assigned: boolean;
}

function SubmitBidInner() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("round");

  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(preselect ? Number(preselect) : null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get("/buyer/rounds").then((r) => {
      setRounds(r.data);
      if (preselect && !selectedRound) setSelectedRound(Number(preselect));
    });
  }, []);

  async function uploadFile(file: File) {
    if (!selectedRound) return;
    setUploading(true);
    setMsg("");
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/buyer/rounds/${selectedRound}/bid`, fd);
      setMsg(`✓ ${res.data.message || "Bid submitted successfully!"} Your pricing has been received and will be reviewed when the round closes.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed. Check that your file matches the template format.");
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  }

  const selectedRoundData = rounds.find((r) => r.id === selectedRound);

  return (
    <BuyerLayout>
      <div style={{ maxWidth: "600px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
          Submit a Bid
        </h2>
        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>
          Upload your pricing file for an open bid round.
        </p>

        {rounds.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: "60px", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
            No open rounds right now. Check back after receiving an invitation.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Round selector */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "24px",
            }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: "8px" }}>
                Select Bid Round
              </label>
              <select
                value={selectedRound ?? ""}
                onChange={(e) => setSelectedRound(Number(e.target.value))}
                className="glass-input"
              >
                <option value="">— Choose a round —</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.commodity})
                  </option>
                ))}
              </select>

              {selectedRoundData && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {selectedRoundData.deadline && (
                    <p style={{ fontSize: "0.75rem", color: "#fbbf24", margin: 0 }}>
                      ⏱ Deadline: {new Date(selectedRoundData.deadline).toLocaleString()}
                    </p>
                  )}
                  {selectedRoundData.customer && (
                    <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                      Customer: {selectedRoundData.customer}
                    </p>
                  )}
                  <div style={{ marginTop: "8px" }}>
                    <button
                      onClick={() => downloadFile(`/buyer/rounds/${selectedRound}/template`, `bid_template_round_${selectedRound}.xlsx`)}
                      className="btn-brand"
                      style={{ fontSize: "0.78rem", padding: "7px 16px" }}
                    >
                      ↓ Download Bid Template (.xlsx)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Upload area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => selectedRound && !uploading && fileRef.current?.click()}
              style={{
                border: `1px dashed ${dragOver ? "rgba(61,129,227,0.6)" : "rgba(255,255,255,0.15)"}`,
                borderRadius: "16px",
                padding: "48px 24px",
                textAlign: "center",
                cursor: selectedRound && !uploading ? "pointer" : "default",
                background: dragOver ? "rgba(61,129,227,0.06)" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📎</div>
              <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.7)", margin: "0 0 6px", fontWeight: 500 }}>
                {uploading ? "Uploading your bid..." : "Drop your pricing file here"}
              </p>
              <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", margin: "0 0 20px" }}>
                or click to browse · Excel, CSV, PDF, Word · Must include Part Number and Unit Price columns
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc" style={{ display: "none" }} onChange={handleFileChange} />
              <button
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                disabled={!selectedRound || uploading}
                className="btn-brand"
                style={{ padding: "10px 28px" }}
              >
                {uploading ? "Uploading..." : "Choose File"}
              </button>
              {!selectedRound && (
                <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.25)", marginTop: "10px", margin: "10px 0 0" }}>
                  Select a round above first
                </p>
              )}
            </div>

            {msg && (
              <div style={{
                padding: "14px 18px",
                background: "rgba(52,211,153,0.12)",
                border: "1px solid rgba(52,211,153,0.25)",
                borderRadius: "12px",
                fontSize: "0.83rem",
                color: "#34d399",
                lineHeight: 1.5,
              }}>
                {msg}
              </div>
            )}
            {error && (
              <div style={{
                padding: "14px 18px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "12px",
                fontSize: "0.83rem",
                color: "#f87171",
              }}>
                {error}
              </div>
            )}

            {/* Instructions card */}
            <div style={{
              background: "rgba(61,129,227,0.06)",
              border: "1px solid rgba(61,129,227,0.15)",
              borderRadius: "14px",
              padding: "20px",
            }}>
              <p style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)", margin: "0 0 10px", fontSize: "0.85rem" }}>
                Submission Tips
              </p>
              <ul style={{ margin: 0, paddingLeft: "18px", color: "rgba(255,255,255,0.4)", fontSize: "0.78rem", lineHeight: 1.7 }}>
                <li>Download the bid template above and fill in your prices</li>
                <li>Only fill in the <strong style={{ color: "rgba(255,255,255,0.6)" }}>Unit Price</strong> column — do not modify part numbers</li>
                <li>Leave blank any lines you don't wish to bid on</li>
                <li>You can re-submit before the deadline — we'll use your latest file</li>
                <li>You can also email your file to <strong style={{ color: "#60a5fa" }}>bids@thinktls.com</strong> with the round number in the subject</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </BuyerLayout>
  );
}

export default function SubmitBid() {
  return (
    <Suspense fallback={<BuyerLayout><div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 60 }}>Loading...</div></BuyerLayout>}>
      <SubmitBidInner />
    </Suspense>
  );
}
