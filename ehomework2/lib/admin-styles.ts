import { CSSProperties } from "react";

export const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  padding: "1.25rem",
};

export const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

export const th: CSSProperties = {
  textAlign: "left",
  padding: "0.75rem 1rem",
  borderBottom: "1px solid var(--border)",
  color: "var(--muted)",
  fontSize: "0.8rem",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export const td: CSSProperties = {
  padding: "0.75rem 1rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.9rem",
};

export const input: CSSProperties = {
  padding: "0.6rem 0.75rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--text)",
  fontSize: "0.9rem",
  outline: "none",
  width: "100%",
};

export const textarea: CSSProperties = {
  ...input,
  minHeight: "6rem",
  resize: "vertical" as const,
  fontFamily: "inherit",
};

export const select: CSSProperties = {
  ...input,
  width: "auto",
  cursor: "pointer",
};

export const btnPrimary: CSSProperties = {
  padding: "0.6rem 1.25rem",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "0.9rem",
  fontWeight: 500,
  cursor: "pointer",
};

export const btnDanger: CSSProperties = {
  ...btnPrimary,
  background: "var(--danger)",
};

export const btnGhost: CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

const statusColors: Record<string, string> = {
  pending: "var(--muted)",
  transcribing: "var(--warning)",
  transcribed: "var(--accent)",
  grading: "var(--warning)",
  graded: "var(--success)",
  transcription_failed: "var(--danger)",
  grading_failed: "var(--danger)",
  retry_transcription: "var(--warning)",
  retry_grading: "var(--warning)",
};

export function badgeStyle(status: string): CSSProperties {
  const color = statusColors[status] || "var(--muted)";
  return {
    display: "inline-block",
    padding: "0.2rem 0.6rem",
    borderRadius: "9999px",
    fontSize: "0.75rem",
    fontWeight: 600,
    background: color,
    color: status === "transcribing" || status === "grading" || status === "retry_transcription" || status === "retry_grading"
      ? "#000"
      : "#fff",
  };
}

export const statCard: CSSProperties = {
  ...card,
  textAlign: "center" as const,
};

export const statNumber: CSSProperties = {
  fontSize: "2rem",
  fontWeight: 700,
  lineHeight: 1.2,
};

export const statLabel: CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--muted)",
  marginTop: "0.25rem",
};
