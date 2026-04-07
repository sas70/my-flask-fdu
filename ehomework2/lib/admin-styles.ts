import { CSSProperties } from "react";

/* ──────────────────────────────────────────────────────────
   Shared inline styles for admin components.
   These work alongside the CSS classes in globals.css.
   Use CSS classes (gf-card, gf-btn-primary, etc.) when possible.
   Use these for inline overrides and JS-driven styling.
   ────────────────────────────────────────────────────────── */

export const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "1.5rem",
};

export const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

export const th: CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 1rem",
  borderBottom: "1px solid var(--border)",
  color: "var(--muted)",
  fontSize: "0.72rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

export const td: CSSProperties = {
  padding: "0.7rem 1rem",
  borderBottom: "1px solid var(--border-light, var(--border))",
  fontSize: "0.875rem",
  color: "var(--text-secondary, var(--text))",
};

export const input: CSSProperties = {
  padding: "0.55rem 0.75rem",
  background: "var(--bg-alt, var(--bg))",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius, 8px)",
  color: "var(--text)",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

export const textarea: CSSProperties = {
  ...input,
  minHeight: "6rem",
  resize: "vertical" as const,
};

export const select: CSSProperties = {
  ...input,
  width: "auto",
  cursor: "pointer",
};

export const btnPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.4rem",
  padding: "0.5rem 1rem",
  background: "var(--accent)",
  color: "#fff",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius, 8px)",
  fontSize: "0.85rem",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

export const btnDanger: CSSProperties = {
  ...btnPrimary,
  background: "var(--danger-subtle, rgba(248,81,73,0.15))",
  color: "var(--danger)",
  borderColor: "transparent",
};

export const btnGhost: CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-secondary, var(--text))",
};

const statusMap: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(139,148,158,0.15)", color: "var(--muted)" },
  transcribing: { bg: "var(--warning-subtle, rgba(210,153,34,0.15))", color: "var(--warning)" },
  transcribed: { bg: "var(--accent-subtle, rgba(88,166,255,0.15))", color: "var(--accent)" },
  grading: { bg: "var(--warning-subtle, rgba(210,153,34,0.15))", color: "var(--warning)" },
  graded: { bg: "var(--success-subtle, rgba(63,185,80,0.15))", color: "var(--success)" },
  transcription_failed: { bg: "var(--danger-subtle, rgba(248,81,73,0.15))", color: "var(--danger)" },
  grading_failed: { bg: "var(--danger-subtle, rgba(248,81,73,0.15))", color: "var(--danger)" },
  retry_transcription: { bg: "var(--warning-subtle, rgba(210,153,34,0.15))", color: "var(--warning)" },
  retry_grading: { bg: "var(--warning-subtle, rgba(210,153,34,0.15))", color: "var(--warning)" },
};

export function badgeStyle(status: string): CSSProperties {
  const s = statusMap[status] || statusMap.pending;
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.15rem 0.55rem",
    borderRadius: "9999px",
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    background: s.bg,
    color: s.color,
  };
}

export const statCard: CSSProperties = {
  ...card,
  textAlign: "center" as const,
};

export const statNumber: CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 700,
  lineHeight: 1.2,
};

export const statLabel: CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  marginTop: "0.35rem",
};
