"use client";

export default function LedgerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, height: "100%", color: "var(--text-primary)" }}>
      <span className="material-icons-round" style={{ fontSize: 40, color: "var(--color-danger)" }}>error_outline</span>
      <p style={{ fontSize: 15, color: "var(--text-secondary)" }}>Something went wrong loading the ledger.</p>
      <button
        onClick={reset}
        style={{ padding: "8px 20px", background: "var(--accent-primary)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
      >
        Try again
      </button>
    </div>
  );
}
