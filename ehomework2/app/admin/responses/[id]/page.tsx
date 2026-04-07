import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import UploadResponsesForm from "../../_components/UploadResponsesForm";
import RetryDiscussionButton from "../../_components/RetryDiscussionButton";

export const dynamic = "force-dynamic";

interface InsightItem {
  student: string;
  issue?: string;
  quote?: string;
  question?: string;
  summary?: string;
  standoutQuote?: string;
  concept?: string;
  explanation?: string;
  frequency?: string;
}

export default async function ResponsesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const doc = await db.collection("discussions").doc(id).get();

  if (!doc.exists) {
    notFound();
  }

  const disc = doc.data()!;
  const insights = disc.insights as {
    overallAssessment?: string;
    redFlags?: InsightItem[];
    wrongConcepts?: InsightItem[];
    instructorQuestions?: InsightItem[];
    topHighQuality?: InsightItem[];
    topLowQuality?: InsightItem[];
    generalObservations?: string[];
  } | undefined;

  const showRetryAnalysis = disc.status === "analysis_failed";
  const showUpload = disc.status === "rubric_ready" || disc.status === "analyzed" || disc.status === "analysis_failed";

  return (
    <>
      {/* Back link */}
      <Link
        href="/admin/responses"
        style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}
      >
        &larr; Back to discussion responses
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
          {disc.title || `Week ${disc.week} Discussion`}
        </h1>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Week {disc.week} — Responses
        </span>
        <span style={s.badgeStyle(
          disc.status === "analyzed" ? "graded"
            : disc.status === "analysis_failed" ? "grading_failed"
            : disc.status === "analyzing" ? "grading"
            : disc.responsesText ? "transcribed"
            : "pending"
        )}>
          {disc.status === "analyzed" ? "analyzed"
            : disc.status === "analysis_failed" ? "analysis failed"
            : disc.status === "analyzing" ? "analyzing"
            : disc.responsesText ? "responses uploaded"
            : "awaiting responses"}
        </span>
      </div>

      {/* Retry analysis */}
      {showRetryAnalysis && (
        <div style={{ marginBottom: "1.5rem" }}>
          <RetryDiscussionButton
            discussionId={id}
            action="retry_analysis"
            label="Retry Analysis"
          />
        </div>
      )}

      {/* Error */}
      {disc.error && disc.status === "analysis_failed" && (
        <div style={{ ...s.card, borderColor: "var(--danger)", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--danger)" }}>
            Error
          </h2>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.8rem", color: "var(--muted)" }}>
            {disc.error}
          </pre>
        </div>
      )}

      {/* Upload responses */}
      {showUpload && (
        <UploadResponsesForm discussionId={id} />
      )}

      {/* Responses file info */}
      {disc.responsesText && (
        <details style={{ ...s.card, marginBottom: "1.5rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
            Student Responses ({disc.responsesText.length.toLocaleString()} chars)
            {disc.responsesFileName && (
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                {" "}— {disc.responsesFileName}
              </span>
            )}
          </summary>
          <pre style={{
            marginTop: "1rem",
            whiteSpace: "pre-wrap",
            fontSize: "0.8rem",
            lineHeight: 1.5,
            color: "var(--muted)",
            maxHeight: "30rem",
            overflow: "auto",
          }}>
            {disc.responsesText}
          </pre>
        </details>
      )}

      {/* ─── INSIGHTS ─── */}
      {insights && (
        <>
          {/* Overall Assessment */}
          {insights.overallAssessment && (
            <div style={{ ...s.card, marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem" }}>
                Overall Assessment
              </h2>
              <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {insights.overallAssessment}
              </p>
            </div>
          )}

          {/* Red Flags */}
          {insights.redFlags && insights.redFlags.length > 0 && (
            <div style={{ ...s.card, borderColor: "var(--danger)", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem", color: "var(--danger)" }}>
                Red Flags
              </h2>
              {insights.redFlags.map((flag: InsightItem, i: number) => (
                <div key={i} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: i < insights.redFlags!.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{flag.student}</div>
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.25rem" }}>{flag.issue}</div>
                  {flag.quote && (
                    <div style={{ fontSize: "0.8rem", fontStyle: "italic", color: "var(--muted)", paddingLeft: "0.75rem", borderLeft: "2px solid var(--danger)" }}>
                      {flag.quote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Wrong Concepts */}
          {insights.wrongConcepts && insights.wrongConcepts.length > 0 && (
            <div style={{ ...s.card, borderColor: "var(--warning)", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem", color: "var(--warning)" }}>
                Misconceptions to Correct
              </h2>
              {insights.wrongConcepts.map((wc: InsightItem, i: number) => (
                <div key={i} style={{ marginBottom: "1rem" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{wc.concept}</div>
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{wc.explanation}</div>
                  {wc.frequency && (
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                      Frequency: {wc.frequency}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Instructor Questions */}
          {insights.instructorQuestions && insights.instructorQuestions.length > 0 && (
            <div style={{ ...s.card, borderColor: "var(--accent)", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem", color: "var(--accent)" }}>
                Questions / Comments for You
              </h2>
              {insights.instructorQuestions.map((q: InsightItem, i: number) => (
                <div key={i} style={{ marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 600 }}>{q.student}:</span>{" "}
                  <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{q.question}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top High Quality & Top Low Quality side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            {insights.topHighQuality && insights.topHighQuality.length > 0 && (
              <div style={s.card}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem", color: "var(--success)" }}>
                  Exceptional Responses
                </h3>
                {insights.topHighQuality.map((item: InsightItem, i: number) => (
                  <div key={i} style={{ marginBottom: "1rem" }}>
                    <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{item.student}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.25rem" }}>{item.summary}</div>
                    {item.standoutQuote && (
                      <div style={{ fontSize: "0.8rem", fontStyle: "italic", color: "var(--muted)", paddingLeft: "0.75rem", borderLeft: "2px solid var(--success)" }}>
                        {item.standoutQuote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {insights.topLowQuality && insights.topLowQuality.length > 0 && (
              <div style={s.card}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem", color: "var(--danger)" }}>
                  Needs Improvement
                </h3>
                {insights.topLowQuality.map((item: InsightItem, i: number) => (
                  <div key={i} style={{ marginBottom: "1rem" }}>
                    <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{item.student}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.25rem" }}>{item.summary}</div>
                    {item.issue && (
                      <div style={{ fontSize: "0.8rem", color: "var(--danger)" }}>
                        Issue: {item.issue}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* General Observations */}
          {insights.generalObservations && insights.generalObservations.length > 0 && (
            <div style={{ ...s.card, marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem" }}>
                General Observations
              </h2>
              <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.7 }}>
                {insights.generalObservations.map((obs: string, i: number) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Links */}
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem", marginTop: "1rem" }}>
        {disc.insightsUrl && (
          <a href={disc.insightsUrl} target="_blank" rel="noopener noreferrer">
            Insights JSON
          </a>
        )}
        <Link href={`/admin/discussions/${id}`}>
          View Prompt &rarr;
        </Link>
      </div>
    </>
  );
}
