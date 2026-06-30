"use client";
import { useState, useRef, useEffect } from "react";
import api from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  role: "admin" | "buyer";
  roundId?: number;
}

export default function ChatWidget({ role, roundId }: Props) {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const bottomRef             = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const endpoint = role === "admin" ? "/chat/admin" : "/chat/buyer";
      const res = await api.post(endpoint, {
        message: text,
        history: messages.slice(-10),
        round_id: roundId ?? null,
      });
      setMessages(prev => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "AI is unavailable right now. Please try again.";
      setError(msg);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="AI Assistant"
        data-tour="chat-button"
        style={{
          position: "fixed", bottom: "24px", right: "24px",
          width: "48px", height: "48px", borderRadius: "50%",
          background: "linear-gradient(135deg, #3D81E3, #6366f1)",
          border: "none", cursor: "pointer", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(61,129,227,0.45)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(61,129,227,0.6)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(61,129,227,0.45)";
        }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: "84px", right: "24px",
          width: "360px", maxWidth: "calc(100vw - 48px)",
          height: "520px", maxHeight: "calc(100vh - 120px)",
          background: "var(--card-bg, #0f1117)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column",
          zIndex: 9998, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
            background: "linear-gradient(135deg, rgba(61,129,227,0.12), rgba(99,102,241,0.08))",
            display: "flex", alignItems: "center", gap: "10px", flexShrink: 0,
          }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "linear-gradient(135deg, #3D81E3, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z"/>
                <path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: "var(--text-1, #e2e8f0)" }}>
                ThinkTLS AI
              </p>
              <p style={{ margin: 0, fontSize: "0.68rem", color: "var(--text-4, #64748b)" }}>
                {role === "admin" ? "Platform assistant" : "Bid portal assistant"}
              </p>
            </div>
            <button
              onClick={() => setMessages([])}
              title="Clear chat"
              style={{
                marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                color: "var(--text-4, #64748b)", padding: "4px", borderRadius: "6px",
                display: "flex", alignItems: "center",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {isEmpty && (
              <div style={{ textAlign: "center", marginTop: "40px" }}>
                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>💬</div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-3, #94a3b8)", margin: "0 0 6px", fontWeight: 600 }}>
                  {role === "admin" ? "Ask about platform activity" : "Ask about your bids & rounds"}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--text-4, #64748b)", margin: 0, lineHeight: 1.5 }}>
                  {role === "admin"
                    ? "Round stats, deal totals, buyer activity…"
                    : "Open rounds, deadlines, your wins…"}
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "82%",
                  padding: "9px 13px",
                  borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: m.role === "user"
                    ? "linear-gradient(135deg, #3D81E3, #6366f1)"
                    : "var(--card-inset, rgba(255,255,255,0.05))",
                  border: m.role === "user" ? "none" : "1px solid var(--border, rgba(255,255,255,0.08))",
                  fontSize: "0.8rem",
                  color: m.role === "user" ? "#fff" : "var(--text-1, #e2e8f0)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "9px 14px",
                  borderRadius: "14px 14px 14px 4px",
                  background: "var(--card-inset, rgba(255,255,255,0.05))",
                  border: "1px solid var(--border, rgba(255,255,255,0.08))",
                  display: "flex", gap: "5px", alignItems: "center",
                }}>
                  {[0,1,2].map(d => (
                    <span key={d} style={{
                      width: "6px", height: "6px", borderRadius: "50%",
                      background: "var(--text-4, #64748b)",
                      animation: "chatDot 1.2s infinite",
                      animationDelay: `${d * 0.2}s`,
                      display: "inline-block",
                    }}/>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: "8px 12px", borderRadius: "10px",
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                fontSize: "0.75rem", color: "#f87171",
              }}>{error}</div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "12px",
            borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
            display: "flex", gap: "8px", alignItems: "flex-end",
            flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything…"
              rows={1}
              style={{
                flex: 1, resize: "none", background: "var(--input-bg, rgba(255,255,255,0.05))",
                border: "1px solid var(--border, rgba(255,255,255,0.1))",
                borderRadius: "10px", padding: "9px 12px",
                fontSize: "0.8rem", color: "var(--text-1, #e2e8f0)",
                outline: "none", lineHeight: 1.5,
                maxHeight: "100px", overflowY: "auto",
                fontFamily: "inherit",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(61,129,227,0.5)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--border, rgba(255,255,255,0.1))"; }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                background: input.trim() && !loading
                  ? "linear-gradient(135deg, #3D81E3, #6366f1)"
                  : "var(--card-inset, rgba(255,255,255,0.06))",
                border: "none", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes chatDot {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
