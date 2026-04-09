import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import RetryButton from "../../_components/RetryButton";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const doc = await db.collection("homeworkSubmissions").doc(id).get();

  if (!doc.exists) {
    notFound();
  }

  const sub = doc.data()!;

  const showRetryTranscription =
    sub.status === "transcription_failed" ||
    sub.status === "pending" ||
    sub.status === "transcribing";
  const showRetryGrading =
    sub.status === "grading_failed" || sub.status === "transcribed";

  return (
    <>
      {/* Back link */}
      <Link
        href="/admin/submissions"
        style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}
      >
        &larr; Back to submissions
      </Link>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginTop: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          {sub.studentName || "Unknown Student"}
        </h1>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Week {sub.week}
        </span>
        <span style={s.badgeStyle(sub.status || "pending")}>
          {(sub.status || "pending").replace(/_/g, " ")}
        </span>
      </div>

      {/* Retry buttons */}
      {(showRetryTranscription || showRetryGrading) && (
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {showRetryTranscription && (
            <RetryButton
              submissionId={id}
              action="retry_transcription"
              label="Retry Transcription"
            />
          )}
          {showRetryGrading && (
            <RetryButton
              submissionId={id}
              action="retry_grading"
              label="Retry Grading"
            />
          )}
        </div>
      )}

      {/* Error message */}
      {(sub.error || sub.gradingError) && (
        <div
          style={{
            ...s.card,
            borderColor: "var(--danger)",
            marginBottom: "1.5rem",
          }}
        >
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--danger)" }}>
            Error
          </h2>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontSize: "0.8rem",
              color: "var(--muted)",
            }}
          >
            {sub.error || sub.gradingError}
          </pre>
        </div>
      )}

      {/* Grade summary */}
      {sub.grade != null && (
        <div style={{ ...s.card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
            Grade
          </h2>
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontSize: "2rem", fontWeight: 700 }}>
                {sub.grade}/{sub.totalPossible}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Score</div>
            </div>
            <div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>
                {sub.letterGrade}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Letter Grade</div>
            </div>
          </div>

          {/* Category breakdown */}
          {sub.categoryScores && sub.categoryScores.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Category</th>
                    <th style={s.th}>Score</th>
                    <th style={s.th}>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {sub.categoryScores.map(
                    (
                      cat: { category: string; score: number; maxPoints: number; feedback: string },
                      i: number
                    ) => (
                      <tr key={i}>
                        <td style={s.td}>{cat.category}</td>
                        <td style={s.td}>
                          {cat.score}/{cat.maxPoints}
                        </td>
                        <td style={{ ...s.td, fontSize: "0.85rem", color: "var(--muted)" }}>
                          {cat.feedback}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {sub.overallFeedback && (
        <div style={{ ...s.card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem" }}>
            Overall Feedback
          </h2>
          <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {sub.overallFeedback}
          </p>
        </div>
      )}

      {/* Strengths & improvements */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        {sub.strengths && sub.strengths.length > 0 && (
          <div style={s.card}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem", color: "var(--success)" }}>
              Strengths
            </h3>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.6 }}>
              {sub.strengths.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {sub.areasForImprovement && sub.areasForImprovement.length > 0 && (
          <div style={s.card}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem", color: "var(--warning)" }}>
              Areas for Improvement
            </h3>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.6 }}>
              {sub.areasForImprovement.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Questions raised */}
      {sub.questionsRaised && sub.questionsRaised.length > 0 && (
        <div style={{ ...s.card, marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem" }}>
            Questions Raised
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.6 }}>
            {sub.questionsRaised.map((q: string, i: number) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcription */}
      {sub.transcriptionText && (
        <details style={s.card}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
            Transcription
          </summary>
          <pre
            style={{
              marginTop: "1rem",
              whiteSpace: "pre-wrap",
              fontSize: "0.8rem",
              lineHeight: 1.5,
              color: "var(--muted)",
              maxHeight: "30rem",
              overflow: "auto",
            }}
          >
            {sub.transcriptionText}
          </pre>
        </details>
      )}

      {/* Links */}
      {(sub.transcriptionUrl || sub.gradeReportUrl) && (
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
          {sub.transcriptionUrl && (
            <a href={sub.transcriptionUrl} target="_blank" rel="noopener noreferrer">
              Transcription file
            </a>
          )}
          {sub.gradeReportUrl && (
            <a href={sub.gradeReportUrl} target="_blank" rel="noopener noreferrer">
              Grade report JSON
            </a>
          )}
        </div>
      )}
    </>
  );
}
