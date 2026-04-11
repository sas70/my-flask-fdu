import type { CSSProperties } from "react";

export type GradeReportData = {
  totalScore?: number;
  totalPossible?: number;
  letterGrade?: string;
  categoryScores?: Array<{
    category?: string;
    score?: number;
    maxPoints?: number;
    feedback?: string;
  }>;
  overallFeedback?: string;
  strengths?: string[];
  areasForImprovement?: string[];
  bonusAwarded?: unknown[];
  deductionsApplied?: Array<{ description?: string; points?: number }>;
  questionsRaised?: string[];
};

const section: CSSProperties = {
  borderRadius: "12px",
  padding: "1.15rem 1.25rem",
  marginBottom: "1rem",
  border: "1px solid var(--border)",
  background: "var(--surface, rgba(255,255,255,0.03))",
};

const h2: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 0.85rem",
  color: "var(--muted)",
};

/**
 * html2canvas (used by PDF export) does not support CSS `color-mix()`.
 * Use plain rgba/hex here so "Download PDF" works; matches the light grading surface.
 */
const pdfSafe = {
  heroGradient: "linear-gradient(135deg, rgba(37, 99, 235, 0.1), #f9fafb)",
  heroBorder: "#9eb7f2",
  overallFeedbackBorder: "#c5d4f5",
  strengthsBorder: "#b8d9c4",
  strengthsBg: "rgba(21, 128, 61, 0.07)",
  areasBorder: "#e5cf8a",
  areasBg: "rgba(202, 138, 4, 0.08)",
  deductionsBorder: "#f0b4b4",
  deductionsBg: "rgba(185, 28, 28, 0.06)",
  bonusBorder: "#b8d9c4",
} as const;

export default function GradingReportView({
  report,
  studentName,
  week,
}: {
  report: GradeReportData;
  studentName?: string;
  week?: number;
}) {
  const total = report.totalPossible && report.totalPossible > 0
    ? Math.min(100, Math.round(((report.totalScore ?? 0) / report.totalPossible) * 100))
    : null;

  return (
    <div style={{ maxWidth: "52rem", margin: "0 auto" }}>
      <div
        style={{
          ...section,
          background: pdfSafe.heroGradient,
          borderColor: pdfSafe.heroBorder,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.75rem 1.5rem" }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem" }}>
              Score
            </div>
            <div style={{ fontSize: "2.35rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {report.totalScore ?? "—"}
              <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--muted)" }}>
                {" "}
                / {report.totalPossible ?? "—"}
              </span>
            </div>
            {total != null && (
              <div
                style={{
                  marginTop: "0.65rem",
                  height: "8px",
                  borderRadius: "999px",
                  background: "var(--border-light, rgba(127,127,127,0.3))",
                  overflow: "hidden",
                  maxWidth: "12rem",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${total}%`,
                    borderRadius: "999px",
                    background: "var(--accent)",
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem" }}>
              Letter grade
            </div>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                color: "var(--accent)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {report.letterGrade ?? "—"}
            </div>
          </div>
          {(studentName || week != null) && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              {studentName && (
                <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{studentName}</div>
              )}
              {week != null && (
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Week {week}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {report.categoryScores && report.categoryScores.length > 0 && (
        <div style={{ ...section, padding: "1rem 1.1rem" }}>
          <h2 style={h2}>Categories</h2>
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {report.categoryScores.map((cat, i) => {
              const pct =
                cat.maxPoints && cat.maxPoints > 0 && cat.score != null
                  ? Math.round((cat.score / cat.maxPoints) * 100)
                  : null;
              return (
                <div
                  key={i}
                  style={{
                    padding: "0.9rem 1rem",
                    borderRadius: "10px",
                    borderLeft: "4px solid var(--accent)",
                    background: "var(--bg-alt, rgba(0,0,0,0.15))",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>{cat.category || "Category"}</span>
                    <span
                      style={{
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--accent)",
                      }}
                    >
                      {cat.score ?? "—"} / {cat.maxPoints ?? "—"}
                      {pct != null && (
                        <span style={{ color: "var(--muted)", fontWeight: 500, marginLeft: "0.35rem" }}>
                          ({pct}%)
                        </span>
                      )}
                    </span>
                  </div>
                  {cat.feedback && (
                    <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.55, color: "var(--muted)" }}>
                      {cat.feedback}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.overallFeedback && (
        <div style={{ ...section, borderColor: pdfSafe.overallFeedbackBorder }}>
          <h2 style={h2}>Overall feedback</h2>
          <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {report.overallFeedback}
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {report.strengths && report.strengths.length > 0 && (
          <div
            style={{
              ...section,
              borderColor: pdfSafe.strengthsBorder,
              background: pdfSafe.strengthsBg,
            }}
          >
            <h2 style={{ ...h2, color: "var(--success, #3fb950)" }}>Strengths</h2>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.88rem", lineHeight: 1.55 }}>
              {report.strengths.map((s, i) => (
                <li key={i} style={{ marginBottom: "0.4rem" }}>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.areasForImprovement && report.areasForImprovement.length > 0 && (
          <div
            style={{
              ...section,
              borderColor: pdfSafe.areasBorder,
              background: pdfSafe.areasBg,
            }}
          >
            <h2 style={{ ...h2, color: "var(--warning, #d4a017)" }}>Areas for improvement</h2>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.88rem", lineHeight: 1.55 }}>
              {report.areasForImprovement.map((s, i) => (
                <li key={i} style={{ marginBottom: "0.4rem" }}>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {report.deductionsApplied && report.deductionsApplied.length > 0 && (
        <div
          style={{
            ...section,
            borderColor: pdfSafe.deductionsBorder,
            background: pdfSafe.deductionsBg,
          }}
        >
          <h2 style={{ ...h2, color: "var(--danger)" }}>Deductions</h2>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: "0.88rem" }}>
            {report.deductionsApplied.map((d, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.5rem 0",
                  borderBottom: i < report.deductionsApplied!.length - 1 ? "1px solid var(--border)" : undefined,
                }}
              >
                <span>{d.description || "—"}</span>
                <span style={{ fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                  {d.points != null ? d.points : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.bonusAwarded && report.bonusAwarded.length > 0 && (
        <div
          style={{
            ...section,
            borderColor: pdfSafe.bonusBorder,
          }}
        >
          <h2 style={{ ...h2, color: "var(--success, #3fb950)" }}>Bonus awarded</h2>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.88rem" }}>
            {report.bonusAwarded.map((b, i) => (
              <li key={i} style={{ marginBottom: "0.35rem" }}>
                {typeof b === "string" ? b : JSON.stringify(b)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.questionsRaised && report.questionsRaised.length > 0 && (
        <div style={section}>
          <h2 style={h2}>Questions raised</h2>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.88rem", lineHeight: 1.55 }}>
            {report.questionsRaised.map((q, i) => (
              <li key={i} style={{ marginBottom: "0.4rem" }}>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
