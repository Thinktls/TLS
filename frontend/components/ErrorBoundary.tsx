"use client";
import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px",
        }}>
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "48px",
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ color: "var(--text-1)", fontSize: "1.25rem", fontWeight: 700, marginBottom: "8px" }}>
              Something went wrong
            </h2>
            <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "24px", lineHeight: 1.6 }}>
              An unexpected error occurred. The error has been logged.
            </p>
            {this.state.error && (
              <pre style={{
                background: "var(--danger-dim)",
                border: "1px solid var(--danger-dim)",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "0.75rem",
                color: "var(--danger)",
                textAlign: "left",
                overflowX: "auto",
                marginBottom: "24px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {this.state.error.message}
              </pre>
            )}
            <button
              className="btn-brand"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
