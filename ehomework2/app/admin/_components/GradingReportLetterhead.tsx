import type { CSSProperties } from "react";

type Props = {
  courseName: string;
  instructorName: string;
  instructorEmail: string;
  /** e.g. "April 10, 2026" */
  reportDateLabel: string;
  /** e.g. "Week 3" or "Week 3 — Lab: Variables" */
  weekLine?: string;
};

const wrap: CSSProperties = {
  marginBottom: "1.35rem",
  padding: "1.15rem 1.2rem",
  borderRadius: "10px",
  background: "linear-gradient(180deg, rgba(37, 99, 235, 0.08), rgba(249, 250, 251, 0.9))",
  border: "1px solid #e5e7eb",
  borderBottom: "3px solid #2563eb",
};

const courseStyle: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: "0.5rem",
};

const titleStyle: CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 800,
  lineHeight: 1.25,
  margin: "0 0 0.85rem",
  color: "var(--text)",
  letterSpacing: "-0.02em",
};

const metaGrid: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  fontSize: "0.88rem",
  color: "var(--muted)",
};

const metaRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: "0.35rem 1.25rem",
};

const metaStrong: CSSProperties = {
  color: "var(--text-secondary, var(--text))",
  fontWeight: 600,
};

const linkStyle: CSSProperties = {
  color: "var(--accent)",
  textDecoration: "none",
};

/**
 * Branded header for printed/PDF grading reports (course, instructor, date, document title).
 */
export default function GradingReportLetterhead({
  courseName,
  instructorName,
  instructorEmail,
  reportDateLabel,
  weekLine,
}: Props) {
  return (
    <header style={wrap}>
      <div style={courseStyle}>{courseName}</div>
      <h1 style={titleStyle}>Instructor feedback on your homework assignment</h1>
      {weekLine ? (
        <p style={{ margin: "0 0 0.85rem", fontSize: "0.92rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          {weekLine}
        </p>
      ) : null}
      <div style={metaGrid}>
        <div style={metaRow}>
          <span>
            <span style={metaStrong}>Instructor</span>
            {instructorName ? ` ${instructorName}` : " —"}
          </span>
          {instructorEmail ? (
            <a href={`mailto:${instructorEmail}`} style={linkStyle}>
              {instructorEmail}
            </a>
          ) : null}
        </div>
        <div>
          <span style={metaStrong}>Report date</span> {reportDateLabel}
        </div>
      </div>
    </header>
  );
}
