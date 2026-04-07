"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as s from "@/lib/admin-styles";

interface UploadRow {
  id: string;
  fileName: string | null;
  csvUrl: string | null;
  status: string;
  rowCount: number | null;
  error: string | null;
  uploadedAt: string | null;
  processedAt: string | null;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Waiting for Cloud Function";
    case "processing":
      return "Processing CSV…";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export default function StudentQuestionnaireUpload() {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/student-questionnaire");
      const data = await res.json();
      if (res.ok) {
        setUploads(data.uploads || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll Firestore-backed status while the parser function may still be running
  useEffect(() => {
    const needsPoll = uploads.some(
      (u) => u.status === "pending" || u.status === "processing"
    );
    if (needsPoll) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        load();
      }, 2000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return undefined;
  }, [uploads, load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Select a CSV file (Google Form export)");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/student-questionnaire", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch {
      setError("Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  const latest = uploads[0];

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading questionnaire status…</p>;
  }

  return (
    <div style={{ ...s.card, marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
        Student questionnaire (CSV)
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        Export your Google Form (preferences, background, learning style, etc.) as{" "}
        <strong>.csv</strong>. The file is uploaded to ByteScale; Firestore stores the link only.
        A Cloud Function parses each row into{" "}
        <code style={{ fontSize: "0.8rem" }}>students_survey_collection</code> and matches rows to
        roster students by <strong>email</strong> first, then by <strong>fuzzy first + last name</strong>{" "}
        (Levenshtein-style similarity) if email does not match. When a student has a bio and/or
        questionnaire data, a second function generates an instructor-facing profile summary.
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ fontSize: "0.85rem", color: "var(--muted)" }}
          />
          <button
            type="submit"
            disabled={uploading}
            style={{ ...s.btnPrimary, opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? "Uploading…" : "Upload CSV"}
          </button>
        </div>
        {error && (
          <p style={{ color: "var(--danger)", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            {error}
          </p>
        )}
      </form>

      {/* Cloud Function processing status — below upload UI */}
      <div
        style={{
          padding: "1rem",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          background: "var(--surface-elevated, rgba(0,0,0,0.02))",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.75rem" }}>
          Cloud Function status
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0 0 1rem 0" }}>
          The <code style={{ fontSize: "0.75rem" }}>onStudentSurveyUploadCreated</code> function
          fetches your CSV, writes one document per response row, and updates matched students.
          Status below refreshes every 2s while processing.
        </p>

        {!latest ? (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
            No uploads yet. Submit a CSV above to see pipeline status.
          </p>
        ) : (
          <>
            <PipelineSteps upload={latest} />

            {latest.error && (
              <pre
                style={{
                  margin: "0.75rem 0 0",
                  fontSize: "0.75rem",
                  color: "var(--danger)",
                  whiteSpace: "pre-wrap",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  background: "rgba(220, 53, 69, 0.08)",
                }}
              >
                {latest.error}
              </pre>
            )}

            {uploads.length > 1 && (
              <div style={{ marginTop: "1.25rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  Recent uploads
                </div>
                <table style={{ ...s.table, fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th style={s.th}>File</th>
                      <th style={s.th}>Function status</th>
                      <th style={s.th}>Rows</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploads.map((u) => (
                      <tr key={u.id}>
                        <td style={s.td}>{u.fileName || "—"}</td>
                        <td style={s.td}>
                          <span
                            style={s.badgeStyle(
                              u.status === "complete"
                                ? "graded"
                                : u.status === "failed"
                                  ? "grading_failed"
                                  : u.status === "processing"
                                    ? "grading"
                                    : "pending"
                            )}
                          >
                            {statusLabel(u.status)}
                          </span>
                        </td>
                        <td style={s.td}>{u.rowCount != null ? u.rowCount : "—"}</td>
                        <td style={s.td}>
                          {u.csvUrl ? (
                            <a href={u.csvUrl} target="_blank" rel="noopener noreferrer">
                              CSV
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PipelineSteps({ upload }: { upload: UploadRow }) {
  const st = upload.status;

  const step1Done = true;
  const step2Done = st === "complete" || st === "failed";
  const step2Active = st === "pending" || st === "processing";
  const step3Done = st === "complete";

  return (
    <div style={{ fontSize: "0.85rem" }}>
      <div style={{ marginBottom: "0.5rem", color: "var(--muted)" }}>
        <strong style={{ color: "var(--foreground)" }}>{upload.fileName || "Upload"}</strong>
        {upload.uploadedAt && (
          <span> — {new Date(upload.uploadedAt).toLocaleString()}</span>
        )}
      </div>

      <ol style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.8 }}>
        <li style={{ color: step1Done ? "var(--foreground)" : "var(--muted)" }}>
          <strong>CSV stored</strong> — File URL saved on this upload document (ByteScale).
          {step1Done && <span style={{ color: "var(--success, #2d6a4f)" }}> ✓</span>}
        </li>
        <li style={{ color: step2Done || step2Active ? "var(--foreground)" : "var(--muted)" }}>
          <strong>Parser function</strong> —{" "}
          {st === "pending" && (
            <>
              Queued; waiting for trigger…
              <span style={{ color: "var(--muted)" }}> (pending)</span>
            </>
          )}
          {st === "processing" && (
            <>
              Running: fetching CSV, parsing rows, matching students…
              <span style={{ color: "var(--accent)" }}> ●</span>
            </>
          )}
          {st === "complete" && (
            <>
              Finished successfully.
              <span style={{ color: "var(--success, #2d6a4f)" }}> ✓</span>
            </>
          )}
          {st === "failed" && (
            <>
              Stopped with an error (see below).
              <span style={{ color: "var(--danger)" }}> ✗</span>
            </>
          )}
          {!["pending", "processing", "complete", "failed"].includes(st) && (
            <span style={s.badgeStyle("pending")}>{st}</span>
          )}
        </li>
        <li style={{ color: step3Done ? "var(--foreground)" : "var(--muted)" }}>
          <strong>Rows &amp; roster updates</strong> —{" "}
          {step3Done ? (
            <>
              {upload.rowCount != null ? `${upload.rowCount} data rows` : "Rows"} written; matched
              students updated with <code style={{ fontSize: "0.75rem" }}>surveyResponses</code>.
              {upload.processedAt && (
                <span style={{ color: "var(--muted)" }}>
                  {" "}
                  Finished {new Date(upload.processedAt).toLocaleString()}.
                </span>
              )}
              <span style={{ color: "var(--success, #2d6a4f)" }}> ✓</span>
            </>
          ) : st === "failed" ? (
            <>Skipped because the parser failed.</>
          ) : (
            <>Pending successful parse.</>
          )}
        </li>
      </ol>

      <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.75rem 0 0", fontStyle: "italic" }}>
        Instructor AI profile summaries run separately per student (<code style={{ fontSize: "0.7rem" }}>onStudentUpdated</code>)
        after rows are merged—check the Students list for “AI profile” badges.
      </p>
    </div>
  );
}
