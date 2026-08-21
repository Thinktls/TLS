"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import Link from "next/link";

interface SuggestedMatch {
  id: number;
  part_number: string;
  description: string;
}

interface ExceptionLine {
  id: number;
  raw_part_number: string;
  normalized_part_number: string;
  description: string;
  unit_price: number;
  exception_type: string;
  exception_notes: string;
  match_score: number | null;
  match_method: string | null;
  buyer_name: string;
  buyer_company: string;
  suggested_match: SuggestedMatch | null;
  ai_match_suggestion: string | null;
  ai_match_confidence: number | null;
  resolved: boolean;
  resolved_by: string | null;
}

interface Stats {
  total: number;
  resolved: number;
  unresolved: number;
  by_type: Record<string, number>;
  ai_suggestions_available: number;
}

interface MasterSearchResult {
  id: number;
  part_number: string;
  part_number_normalized: string;
  description: string;
  unit: string | null;
  quantity_requested: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  unmatched: "Unmatched",
  partial_match: "Partial Match",
  duplicate: "Duplicate",
  price_anomaly: "Price Anomaly",
  below_reserve: "Below Reserve",
  overbid: "Overbid",
  rejected: "Rejected",
  bad_format: "Bad Format",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  unmatched: "Buyer submitted a part number that doesn't exist in your master catalog. Use AI Match or search manually to link it.",
  partial_match: "Part number is similar to one in your catalog but didn't match exactly. Review and confirm if correct.",
  duplicate: "This part number was submitted more than once by the same buyer. Only one bid can win.",
  price_anomaly: "One buyer's price on this item is far from what everyone else bid — usually a typo like an extra zero or a dropped decimal. Read the reason below, then Accept Price if it's correct or Remove it from the round.",
  below_reserve: "Buyer's bid is below your minimum acceptable price. Cannot win without admin override.",
  overbid: "Bid is significantly higher than other bids — may be a data entry error. Confirm before awarding.",
  rejected: "This bid line was manually rejected and removed from consideration.",
  bad_format: "Part number or data format couldn't be parsed. Try remapping to the correct catalog item.",
};

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  unmatched: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  partial_match: { bg: "rgba(251,146,60,0.15)", color: "#fb923c" },
  duplicate: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  price_anomaly: { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
  below_reserve: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5" },
  overbid: { bg: "rgba(251,146,60,0.12)", color: "#fdba74" },
  rejected: { bg: "var(--surface)", color: "var(--text-3)" },
  bad_format: { bg: "rgba(251,191,36,0.1)", color: "#fde68a" },
};

function ConfidenceBadge({ score }: { score: number | null }) {
  if (!score) return null;
  const color = score >= 85 ? "#34d399" : score >= 75 ? "#fbbf24" : "#f87171";
  const label = score >= 85 ? "High confidence" : score >= 75 ? "Medium confidence" : "Low confidence";
  return (
    <span
      title={`AI match confidence: ${score.toFixed(0)}% — ${label}`}
      style={{
        padding: "2px 8px", borderRadius: "100px", fontSize: "0.68rem", fontWeight: 700,
        background: `${color}22`, color, marginLeft: "4px", cursor: "help",
      }}
    >
      {score.toFixed(0)}% match
    </span>
  );
}

function MasterSearch({
  roundId,
  onSelect,
  onCancel,
}: {
  roundId: string;
  onSelect: (item: MasterSearchResult) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MasterSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/exceptions/rounds/${roundId}/search-master`, { params: { q } });
        setResults(res.data);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, roundId]);

  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px solid rgba(61,129,227,0.3)",
      borderRadius: "12px",
      padding: "16px",
      marginTop: "10px",
    }}>
      <input
        aria-label="Search master items by part number or description"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by part number or description..."
        className="glass-input"
        style={{ marginBottom: "10px" }}
      />
      {searching && <p style={{ fontSize: "0.78rem", color: "var(--text-4)" }}>Searching...</p>}
      {results.map((r) => (
        <div
          key={r.id}
          onClick={() => onSelect(r)}
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "4px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(61,129,227,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
        >
          <p style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-1)", margin: "0 0 2px" }}>{r.part_number}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: 0 }}>{r.description}</p>
        </div>
      ))}
      {q.length >= 2 && !searching && results.length === 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-4)", textAlign: "center" }}>No master items found</p>
      )}
      <button onClick={onCancel} className="btn-ghost" style={{ marginTop: "8px", fontSize: "0.78rem", padding: "5px 14px" }}>
        Cancel
      </button>
    </div>
  );
}

export default function ExceptionsPage() {
  const params = useParams();
  const id = params.id as string;

  const [exceptions, setExceptions] = useState<ExceptionLine[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [resolving, setResolving] = useState<number | null>(null);

  // Honour ?type=<exception_type> so links can deep-link to one kind of exception — the
  // analytics page points its per-buyer anomaly badges straight here.
  // Read from window.location in an effect rather than useSearchParams(): that hook opts the
  // whole route into client-side rendering unless it's wrapped in a Suspense boundary, and
  // this is a one-shot read of an optional param on mount.
  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("type");
    if (type) setActiveFilter(type);
  }, []);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [searchingLine, setSearchingLine] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [excRes, statsRes] = await Promise.all([
        api.get(`/exceptions/rounds/${id}`),
        api.get(`/exceptions/rounds/${id}/stats`),
      ]);
      setExceptions(excRes.data);
      setStats(statsRes.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function resolve(lineId: number, action: string, newMasterId?: number) {
    setResolving(lineId);
    try {
      await api.patch(`/exceptions/${lineId}/resolve`, {
        action,
        new_master_item_id: newMasterId ?? null,
        notes: notes[lineId] || null,
      });
      showToast("Exception resolved");
      load();
    } catch {
      showToast("Failed to resolve", false);
    } finally {
      setResolving(null);
      setSearchingLine(null);
    }
  }

  async function bulkApproveAI() {
    setBulkWorking(true);
    try {
      const res = await api.post(`/exceptions/rounds/${id}/bulk-resolve`, { action: "approve_suggested" });
      showToast(`Approved ${res.data.resolved} AI suggestions`);
      load();
    } catch {
      showToast("Bulk approve failed", false);
    } finally {
      setBulkWorking(false);
    }
  }

  async function triggerAI() {
    setAiRunning(true);
    try {
      await api.post(`/rounds/${id}/ai-match`);
      showToast("AI matching started — refresh in a moment");
      setTimeout(load, 4000);
    } catch {
      showToast("AI match trigger failed", false);
    } finally {
      setAiRunning(false);
    }
  }

  const filtered = exceptions.filter((e) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "unresolved") return !e.resolved;
    if (activeFilter === "resolved") return e.resolved;
    return e.exception_type === activeFilter;
  });

  const unresolvedCount = exceptions.filter((e) => !e.resolved).length;

  const filterTabs = [
    { key: "all", label: `All (${exceptions.length})` },
    { key: "unresolved", label: `Unresolved (${unresolvedCount})` },
    ...(stats
      ? Object.entries(stats.by_type).map(([type, count]) => ({
          key: type,
          label: `${TYPE_LABELS[type] || type} (${count})`,
        }))
      : []),
    { key: "resolved", label: `Resolved (${exceptions.length - unresolvedCount})` },
  ];

  if (loading) return (
    <AdminLayout>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(61,129,227,0.3)", borderTopColor: "#3D81E3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (loadError) return (
    <AdminLayout>
      <div style={{ textAlign: "center", paddingTop: "80px" }}>
        <p style={{ color: "#f87171", fontSize: "0.9rem", marginBottom: "12px" }}>Failed to load exceptions.</p>
        <button onClick={load} className="btn-ghost" style={{ fontSize: "0.82rem" }}>Retry</button>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div style={{ maxWidth: "920px" }} className="animate-in">
        {/* Toast */}
        {toast && (
          <div style={{
            position: "fixed", top: "24px", right: "24px", zIndex: 9999,
            padding: "12px 20px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 500,
            background: toast.ok ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${toast.ok ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: toast.ok ? "#34d399" : "#f87171",
            backdropFilter: "blur(8px)",
          }}>
            {toast.msg}
          </div>
        )}

        <Link href={`/admin/rounds/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-4)", textDecoration: "none", marginBottom: "18px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Round Detail
        </Link>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", margin: "0 0 4px", lineHeight: 1.3 }}>
              Review Flagged Bids
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-4)", margin: 0 }}>
              These bid lines couldn't be automatically matched. For each one: accept a suggestion, search the catalog, or reject the line.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {stats && stats.ai_suggestions_available > 0 && (
              <button
                onClick={bulkApproveAI}
                disabled={bulkWorking}
                className="btn-brand"
                style={{ fontSize: "0.82rem", padding: "8px 16px" }}
                title="Accept all AI-suggested matches at once — only applies to lines where the AI found a match"
              >
                {bulkWorking ? "Accepting…" : `⚡ Accept All ${stats.ai_suggestions_available} AI Matches`}
              </button>
            )}
            <button
              onClick={triggerAI}
              disabled={aiRunning}
              className="btn-ghost"
              style={{ fontSize: "0.82rem", padding: "8px 16px" }}
              title="Use AI to automatically suggest matches for unmatched bid lines"
            >
              {aiRunning ? "AI running…" : "🤖 Run AI Matching"}
            </button>
          </div>
        </div>

        {/* How-to callout */}
        <div style={{ padding: "12px 16px", background: "rgba(61,129,227,0.06)", border: "1px solid rgba(61,129,227,0.15)", borderRadius: "10px", marginBottom: "20px" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>How to handle each flag</p>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            {[
              { icon: "🤖", title: "Accept AI Match", body: "The AI found a matching catalog item. Click Accept to remap this bid to that item so it can compete." },
              { icon: "✓", title: "Approve Price / Reserve", body: "For price anomalies or below-reserve bids — click Approve to override and let the bid enter competition." },
              { icon: "🔍", title: "Find in Catalog", body: "Search your master item list and manually link this bid line to the correct catalog entry." },
              { icon: "✕", title: "Remove from Round", body: "Reject lines that can't be fulfilled or are clearly invalid — they won't appear in winner selection." },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ display: "flex", gap: "8px", alignItems: "flex-start", flex: "1 1 160px" }}>
                <span style={{ fontSize: "1rem", lineHeight: 1 }}>{icon}</span>
                <div>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-2)", margin: "0 0 2px" }}>{title}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: 0, lineHeight: 1.4 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stat pills */}
        {stats && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
            {[
              { label: "Total",      value: stats.total,                   color: "var(--text-2)", bg: "var(--surface)", border: "var(--border)" },
              { label: "Unresolved", value: stats.unresolved,              color: "#fb923c",       bg: "rgba(251,146,60,0.07)", border: "rgba(251,146,60,0.2)" },
              { label: "Resolved",   value: stats.resolved,                color: "#34d399",       bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.2)" },
              { label: "AI Matched", value: stats.ai_suggestions_available, color: "#a78bfa",      bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.2)" },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} style={{ padding: "10px 16px", background: bg, border: `1px solid ${border}`, borderRadius: "var(--radius-lg)" }}>
                <p style={{ fontSize: "0.65rem", color: "var(--text-4)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{label}</p>
                <p style={{ fontSize: "1.25rem", fontWeight: 800, color, margin: 0, letterSpacing: "-0.03em" }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px", width: "fit-content", marginBottom: "20px" }}>
          {filterTabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveFilter(tab.key)} style={{
              padding: "5px 13px", borderRadius: "7px", fontSize: "0.78rem", cursor: "pointer", border: "none", fontFamily: "inherit",
              background: activeFilter === tab.key ? "rgba(61,129,227,0.18)" : "transparent",
              color: activeFilter === tab.key ? "var(--text-1)" : "var(--text-4)",
              fontWeight: activeFilter === tab.key ? 600 : 400, transition: "all 0.15s",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Exception cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filtered.length === 0 && (
            <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-xl)", padding: "60px", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>✓</div>
              <p style={{ color: "var(--text-4)", fontSize: "0.9rem", margin: 0 }}>
                {activeFilter === "unresolved" ? "All exceptions resolved." : "No exceptions match this filter."}
              </p>
            </div>
          )}

          {filtered.map((ex) => {
            const typeStyle = TYPE_COLORS[ex.exception_type] || { bg: "var(--surface)", color: "var(--text-3)" };
            const isWorking = resolving === ex.id;

            return (
              <div key={ex.id} style={{
                background: ex.resolved ? "var(--surface)" : "var(--bg-2)",
                border: `1px solid ${ex.resolved ? "var(--border)" : "rgba(251,146,60,0.2)"}`,
                borderRadius: "var(--radius-xl)",
                padding: "20px 22px",
                opacity: ex.resolved ? 0.6 : 1,
              }}>
                {/* Top row: part info + buyer/price */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                      <span style={{ padding: "2px 10px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 700, background: typeStyle.bg, color: typeStyle.color }}>
                        {TYPE_LABELS[ex.exception_type] || ex.exception_type}
                      </span>
                      {ex.resolved && (
                        <span style={{ fontSize: "0.7rem", color: "#34d399" }}>✓ Resolved{ex.resolved_by ? ` by ${ex.resolved_by}` : ""}</span>
                      )}
                    </div>
                    <p style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--text-1)", margin: "0 0 2px", fontSize: "0.92rem" }}>
                      {ex.raw_part_number}
                    </p>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-3)", margin: "0 0 6px" }}>{ex.description}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: 0, lineHeight: 1.45 }}>
                      {TYPE_DESCRIPTIONS[ex.exception_type] || "Review this line and take an action below."}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "20px" }}>
                    <p style={{ fontWeight: 700, color: "var(--text-1)", margin: "0 0 2px", fontSize: "1rem", fontFamily: "monospace" }}>
                      {ex.unit_price != null ? `$${ex.unit_price.toFixed(2)}` : "—"}
                    </p>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-4)", margin: 0 }}>from {ex.buyer_company || ex.buyer_name}</p>
                  </div>
                </div>

                {/* System notes (anomaly reason, etc.) */}
                {ex.exception_notes && (
                  <div style={{ padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", marginBottom: "12px" }}>
                    <p style={{ fontSize: "0.73rem", color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>
                      <strong style={{ color: "var(--text-2)" }}>Why flagged: </strong>{ex.exception_notes}
                    </p>
                  </div>
                )}

                {/* AI suggestion block */}
                {ex.ai_match_suggestion && (
                  <div style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: "10px", padding: "12px 16px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.72rem", color: "#a78bfa", fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          🤖 AI Found a Match <ConfidenceBadge score={ex.ai_match_confidence} />
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "rgba(196,181,253,0.5)", margin: "0 0 3px" }}>Catalog item to remap to:</p>
                        <p style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "rgba(196,181,253,0.95)", margin: "0 0 4px", fontWeight: 600 }}>
                          {ex.ai_match_suggestion}
                        </p>
                        <p style={{ fontSize: "0.72rem", color: "rgba(167,139,250,0.6)", margin: 0 }}>
                          {(ex.ai_match_confidence ?? 0) >= 85
                            ? "High confidence — safe to accept."
                            : (ex.ai_match_confidence ?? 0) >= 75
                            ? "Medium confidence — review before accepting."
                            : "Low confidence — verify manually before accepting."}
                        </p>
                      </div>
                      {!ex.resolved && (
                        <button
                          type="button"
                          onClick={() => resolve(ex.id, "approve_ai")}
                          disabled={isWorking}
                          className="btn-brand"
                          style={{ fontSize: "0.78rem", padding: "8px 16px", background: "#7c3aed", border: "1px solid rgba(167,139,250,0.4)", whiteSpace: "nowrap" }}
                        >
                          ✓ Accept AI Match
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Fuzzy suggested match block */}
                {ex.suggested_match && !ex.ai_match_suggestion && (
                  <div style={{ background: "rgba(61,129,227,0.08)", border: "1px solid rgba(61,129,227,0.2)", borderRadius: "10px", padding: "12px 16px", marginBottom: "12px" }}>
                    <p style={{ color: "#60a5fa", fontWeight: 700, margin: "0 0 6px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Similar Item Found in Catalog — {ex.match_score?.toFixed(0)}% match
                    </p>
                    <p style={{ fontSize: "0.7rem", color: "rgba(147,197,253,0.5)", margin: "0 0 3px" }}>Catalog item to remap to:</p>
                    <p style={{ fontFamily: "monospace", fontSize: "0.84rem", color: "rgba(147,197,253,0.9)", margin: "0 0 4px", fontWeight: 600 }}>
                      {ex.suggested_match.part_number}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "rgba(147,197,253,0.6)", margin: 0 }}>{ex.suggested_match.description}</p>
                  </div>
                )}

                {/* Action area */}
                {!ex.resolved && (
                  <>
                    <input
                      aria-label="Resolution notes (optional)"
                      value={notes[ex.id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [ex.id]: e.target.value }))}
                      placeholder="Optional note (e.g. confirmed with buyer, wrong model)"
                      className="glass-input"
                      style={{ marginBottom: "10px", fontSize: "0.78rem", padding: "7px 12px" }}
                    />
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      {/* Below-reserve: allow admin to override the floor price */}
                      {ex.exception_type === "below_reserve" && (
                        <button
                          type="button"
                          onClick={() => resolve(ex.id, "approve_match")}
                          disabled={isWorking}
                          className="btn-brand"
                          style={{ fontSize: "0.78rem", padding: "7px 16px", background: "#059669" }}
                          title="Override the reserve floor and allow this bid to compete"
                        >
                          ✓ Approve Below-Reserve Bid
                        </button>
                      )}
                      {/* Price anomaly: confirm the unusual price is intentional */}
                      {ex.exception_type === "price_anomaly" && (
                        <button
                          type="button"
                          onClick={() => resolve(ex.id, "approve_match")}
                          disabled={isWorking}
                          className="btn-brand"
                          style={{ fontSize: "0.78rem", padding: "7px 16px", background: "#7c3aed" }}
                          title="Confirm this price is intentional and allow it to compete"
                        >
                          ✓ Accept Price
                        </button>
                      )}
                      {/* Fuzzy text-similarity match confirm */}
                      {ex.suggested_match && ex.exception_type !== "below_reserve" && ex.exception_type !== "price_anomaly" && (
                        <button
                          type="button"
                          onClick={() => resolve(ex.id, "approve_match")}
                          disabled={isWorking}
                          className="btn-brand"
                          style={{ fontSize: "0.78rem", padding: "7px 16px", background: "#059669" }}
                        >
                          ✓ Confirm Match
                        </button>
                      )}
                      <button
                        aria-label={searchingLine === ex.id ? "Cancel catalog search" : `Search catalog for ${ex.raw_part_number}`}
                        onClick={() => setSearchingLine(searchingLine === ex.id ? null : ex.id)}
                        disabled={isWorking}
                        className="btn-ghost"
                        style={{ fontSize: "0.78rem", padding: "7px 16px" }}
                      >
                        {searchingLine === ex.id ? "Cancel Search" : "🔍 Find in Catalog"}
                      </button>
                      <button
                        aria-label={`Remove ${ex.raw_part_number} from this round`}
                        onClick={() => resolve(ex.id, "reject")}
                        disabled={isWorking}
                        className="btn-ghost"
                        style={{ fontSize: "0.78rem", padding: "7px 16px", color: "#f87171", borderColor: "rgba(239,68,68,0.25)" }}
                      >
                        ✕ Remove from Round
                      </button>
                      {isWorking && <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Saving…</span>}
                    </div>
                  </>
                )}

                {/* Master item search */}
                {searchingLine === ex.id && (
                  <MasterSearch
                    roundId={id}
                    onSelect={(item) => resolve(ex.id, "remap", item.id)}
                    onCancel={() => setSearchingLine(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
