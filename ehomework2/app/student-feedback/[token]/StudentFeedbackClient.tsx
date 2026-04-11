"use client";

import { useCallback, useEffect, useState } from "react";
import GradingReportLetterhead from "@/app/admin/_components/GradingReportLetterhead";
import type { GradeReportData } from "@/app/admin/_components/GradingReportView";
import type { GradingLetterhead } from "@/lib/grading-report-data";
import type { StudentFeedbackReturn } from "@/lib/student-feedback-payload";
import { normalizeFeedbackPayload, splitOverallIntoParagraphs } from "@/lib/student-feedback-payload";

type GetJson = {
  ok?: boolean;
  error?: string;
  report?: GradeReportData;
  letterhead?: GradingLetterhead | null;
  studentName?: string;
  week?: number;
  existingFeedback?: StudentFeedbackReturn | null;
};

export default function StudentFeedbackClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<GradeReportData | null>(null);
  const [letterhead, setLetterhead] = useState<GradingLetterhead | null>(null);
  const [studentName, setStudentName] = useState<string | undefined>();
  const [payload, setPayload] = useState<StudentFeedbackReturn | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/student-feedback/${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = (await res.json()) as GetJson;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Error (${res.status})`);
        setReport(null);
        return;
      }
      if (!data.report) {
        setError("No report data.");
        return;
      }
      setReport(data.report);
      setLetterhead(data.letterhead ?? null);
      setStudentName(data.studentName);
      const init = normalizeFeedbackPayload(
        data.report,
        data.existingFeedback ?? {}
      );
      setPayload(init);
    } catch {
      setError("Could not load this page.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!report || !payload) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/student-feedback/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Submit failed");
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof StudentFeedbackReturn>(key: K, value: StudentFeedbackReturn[K]) {
    setPayload((p) => (p ? { ...p, [key]: value } : p));
  }

  function updateAt<K extends "categoryReplies" | "overallParagraphReplies" | "strengthItemReplies" | "areaItemReplies">(
    key: K,
    index: number,
    text: string
  ) {
    setPayload((p) => {
      if (!p) return p;
      const arr = [...p[key]];
      arr[index] = text;
      return { ...p, [key]: arr };
    });
  }

  if (loading) {
    return (
      <div className="student-feedback-shell">
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="student-feedback-shell">
        <p style={{ color: "#b91c1c", fontWeight: 600 }}>{error}</p>
      </div>
    );
  }

  if (!report || !payload || !letterhead) {
    return (
      <div className="student-feedback-shell">
        <p style={{ color: "#6b7280" }}>Nothing to show.</p>
      </div>
    );
  }

  const overallParts = splitOverallIntoParagraphs(report.overallFeedback);

  return (
    <form onSubmit={handleSubmit}>
      <div className="student-feedback-shell">
        {done && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: 10,
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              color: "#065f46",
              marginBottom: "1.25rem",
              fontWeight: 600,
            }}
          >
            Thank you — your comments were sent to your instructor. You can close this page.
          </div>
        )}
        {error && report && (
          <p style={{ color: "#b91c1c", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</p>
        )}

        <div className="grading-report-pdf-surface" style={{ marginBottom: "1.5rem" }}>
          <GradingReportLetterhead {...letterhead} />
          <p style={{ fontSize: "0.88rem", color: "#4b5563", marginBottom: "1rem" }}>
            Read the feedback below. Optionally add your thoughts under each section, then submit at the bottom.
            {studentName ? ` — ${studentName}` : ""}
          </p>

          {/* Categories */}
          {report.categoryScores && report.categoryScores.length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#6b7280",
                  margin: "0 0 1rem",
                }}
              >
                Categories
              </h2>
              {report.categoryScores.map((cat, i) => (
                <div key={i} style={{ marginBottom: "1.25rem" }}>
                  <div
                    style={{
                      padding: "0.9rem 1rem",
                      borderRadius: 10,
                      borderLeft: "4px solid #2563eb",
                      background: "#f3f4f6",
                      marginBottom: "0.65rem",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>{cat.category}</div>
                    <div style={{ fontSize: "0.88rem", color: "#2563eb", fontWeight: 700, marginBottom: "0.5rem" }}>
                      {cat.score ?? "—"} / {cat.maxPoints ?? "—"}
                    </div>
                    {cat.feedback && (
                      <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.55, color: "#4b5563" }}>
                        {cat.feedback}
                      </p>
                    )}
                  </div>
                  <label className="sf-reply-label">Your response (optional)</label>
                  <textarea
                    className="sf-textarea"
                    value={payload.categoryReplies[i] ?? ""}
                    onChange={(e) => updateAt("categoryReplies", i, e.target.value)}
                    disabled={done}
                    placeholder="Questions, reflections, or disagreement…"
                  />
                </div>
              ))}
            </section>
          )}

          {/* Overall — per paragraph */}
          {overallParts.length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#6b7280",
                  margin: "0 0 1rem",
                }}
              >
                Overall feedback
              </h2>
              {overallParts.map((para, i) => (
                <div key={i} className="sf-instructor-block">
                  <p style={{ margin: "0 0 0.65rem", fontSize: "0.92rem", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {para}
                  </p>
                  <label className="sf-reply-label">Your response to this part (optional)</label>
                  <textarea
                    className="sf-textarea"
                    value={payload.overallParagraphReplies[i] ?? ""}
                    onChange={(e) => updateAt("overallParagraphReplies", i, e.target.value)}
                    disabled={done}
                  />
                </div>
              ))}
            </section>
          )}

          {/* Strengths */}
          {report.strengths && report.strengths.length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#15803d",
                  margin: "0 0 1rem",
                }}
              >
                Strengths
              </h2>
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {report.strengths.map((s, i) => (
                  <li key={i} style={{ marginBottom: "1rem" }}>
                    <span style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{s}</span>
                    <label className="sf-reply-label" style={{ marginTop: "0.65rem" }}>
                      Your comment (optional)
                    </label>
                    <textarea
                      className="sf-textarea"
                      style={{ minHeight: "3.5rem" }}
                      value={payload.strengthItemReplies[i] ?? ""}
                      onChange={(e) => updateAt("strengthItemReplies", i, e.target.value)}
                      disabled={done}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Areas */}
          {report.areasForImprovement && report.areasForImprovement.length > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#a16207",
                  margin: "0 0 1rem",
                }}
              >
                Areas for improvement
              </h2>
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {report.areasForImprovement.map((s, i) => (
                  <li key={i} style={{ marginBottom: "1rem" }}>
                    <span style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{s}</span>
                    <label className="sf-reply-label" style={{ marginTop: "0.65rem" }}>
                      Your comment (optional)
                    </label>
                    <textarea
                      className="sf-textarea"
                      style={{ minHeight: "3.5rem" }}
                      value={payload.areaItemReplies[i] ?? ""}
                      onChange={(e) => updateAt("areaItemReplies", i, e.target.value)}
                      disabled={done}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section style={{ marginBottom: "1rem" }}>
            <label className="sf-reply-label">Anything else? (optional)</label>
            <textarea
              className="sf-textarea"
              style={{ minHeight: "6rem" }}
              value={payload.generalComment}
              onChange={(e) => update("generalComment", e.target.value)}
              disabled={done}
              placeholder="Overall thoughts, questions for your instructor, or context you want them to know…"
            />
          </section>
        </div>

        <div className="sf-submit-bar">
          <button
            type="submit"
            disabled={saving || done}
            style={{
              padding: "0.65rem 1.35rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "#fff",
              background: done ? "#9ca3af" : "#2563eb",
              border: "none",
              borderRadius: 10,
              cursor: done || saving ? "default" : "pointer",
              width: "100%",
              maxWidth: "20rem",
            }}
          >
            {done ? "Submitted" : saving ? "Sending…" : "Submit feedback to instructor"}
          </button>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.78rem", color: "#6b7280" }}>
            You can submit again from this same link to update your responses.
          </p>
        </div>
      </div>
    </form>
  );
}
