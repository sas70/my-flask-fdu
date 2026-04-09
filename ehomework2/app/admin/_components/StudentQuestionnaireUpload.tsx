"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as s from "@/lib/admin-styles";

interface MatchRow {
  rowIndex: number;
  studentId: string;
  rosterName: string;
  method: string;
  email: string | null;
  nameFromForm: string;
  nameMatchScore: number | null;
}

interface UnmatchRow {
  rowIndex: number;
  email: string | null;
  nameFromForm: string;
  reason: string;
}

interface UploadRow {
  id: string;
  fileName: string | null;
  csvUrl: string | null;
  status: string;
  rowCount: number | null;
  matchedToRosterCount: number | null;
  unmatchedRowCount: number | null;
  matchedStudentSummary: MatchRow[] | null;
  unmatchedRowSummary: UnmatchRow[] | null;
  summaryTruncated: boolean;
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
  const [serverParsing, setServerParsing] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/student-questionnaire", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Session expired or not logged in — open /login and sign in again.");
        setUploads([]);
        return;
      }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Could not load status (${res.status})`);
        setUploads([]);
        return;
      }
      setUploads(data.uploads || []);
      setError("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setError(
        msg === "Failed to fetch"
          ? "Could not reach the server — is `npm run dev` running? Use the same host you used to log in (e.g. localhost vs LAN IP)."
          : msg
      );
      setUploads([]);
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
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Session expired — log in again at /login"
            : (data.error as string) || `Upload failed (${res.status})`
        );
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "Failed to fetch"
          ? "Network error — check that the dev server is running."
          : "Something went wrong"
      );
    } finally {
      setUploading(false);
    }
  }

  async function runServerParse(uploadId: string) {
    setServerParsing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/student-questionnaire", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Session expired — log in again at /login");
        return;
      }
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : `Parse request failed (${res.status})`
        );
        return;
      }
      await load();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "Failed to fetch"
          ? "Network error — check that the dev server is running."
          : "Server parse failed"
      );
    } finally {
      setServerParsing(false);
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

      {error && (
        <p
          role="alert"
          style={{
            color: "var(--danger)",
            margin: "0 0 1rem",
            fontSize: "0.85rem",
            padding: "0.65rem 0.75rem",
            borderRadius: "6px",
            border: "1px solid var(--danger)",
            background: "rgba(220, 53, 69, 0.06)",
          }}
        >
          {error}
        </p>
      )}

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
          Status below refreshes every 2s while processing. Per-row outcomes are logged in{" "}
          <strong>Firebase → Functions → Logs</strong> (filter <code>survey CSV</code>) and saved on
          the upload document when complete.
        </p>
        {latest && (latest.status === "pending" || latest.status === "processing") && (
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--muted)",
              margin: "0 0 1rem",
              padding: "0.5rem 0.65rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "rgba(0,0,0,0.03)",
            }}
          >
            <strong>If pending never becomes processing</strong>, the Firestore trigger is not running
            for this project: deploy functions with{" "}
            <code style={{ fontSize: "0.7rem" }}>npm run deploy:functions</code>, confirm{" "}
            <code style={{ fontSize: "0.7rem" }}>firebase use</code> matches the project in{" "}
            <code style={{ fontSize: "0.7rem" }}>FIREBASE_SERVICE_ACCOUNT_KEY</code>, and check Firebase →
            Functions → Logs for <code style={{ fontSize: "0.7rem" }}>survey CSV</code>. Pending should
            flip to <em>processing</em> within seconds when the function runs.
          </p>
        )}

        {latest && (latest.status === "pending" || latest.status === "failed") && (
          <div
            style={{
              margin: "0 0 1rem",
              padding: "0.65rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "rgba(59, 130, 246, 0.06)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <button
                type="button"
                disabled={serverParsing}
                onClick={() => runServerParse(latest.id)}
                style={{ ...s.btnPrimary, opacity: serverParsing ? 0.7 : 1, fontSize: "0.8rem" }}
              >
                {serverParsing ? "Parsing…" : "Parse CSV on app server"}
              </button>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Same logic as <code style={{ fontSize: "0.7rem" }}>onStudentSurveyUploadCreated</code> — use
                if Cloud Functions are not deployed or the trigger never fires.
              </span>
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0.5rem 0 0" }}>
              Runs in your Next.js server (see terminal logs for <code>student-questionnaire PATCH</code>
              ). Very large CSVs may time out on hosted platforms with short function limits.
            </p>
          </div>
        )}

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

            {latest.status === "complete" &&
              (latest.matchedStudentSummary?.length || latest.unmatchedRowSummary?.length) ? (
              <div style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
                  Match results (this upload)
                  {latest.matchedToRosterCount != null && latest.unmatchedRowCount != null && (
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                      {" "}
                      — {latest.matchedToRosterCount} matched, {latest.unmatchedRowCount} not matched
                      {latest.rowCount != null ? ` of ${latest.rowCount} rows` : ""}
                    </span>
                  )}
                </div>
                {latest.summaryTruncated && (
                  <p style={{ color: "var(--muted)", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>
                    Lists show first 80 per category; see Cloud Logs for full detail.
                  </p>
                )}
                {latest.matchedStudentSummary && latest.matchedStudentSummary.length > 0 && (
                  <details open style={{ marginBottom: "0.75rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--success, #2d6a4f)" }}>
                      Matched to roster ({latest.matchedStudentSummary.length} shown)
                    </summary>
                    <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
                      <table style={{ ...s.table, fontSize: "0.75rem" }}>
                        <thead>
                          <tr>
                            <th style={s.th}>Row</th>
                            <th style={s.th}>Roster student</th>
                            <th style={s.th}>Method</th>
                            <th style={s.th}>Email (form)</th>
                            <th style={s.th}>Name (form)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latest.matchedStudentSummary.map((m, i) => (
                            <tr key={i}>
                              <td style={s.td}>{m.rowIndex}</td>
                              <td style={s.td}>
                                <a href={`/admin/students/${m.studentId}`}>{m.rosterName}</a>
                              </td>
                              <td style={s.td}>
                                {m.method}
                                {m.nameMatchScore != null ? ` (${m.nameMatchScore})` : ""}
                              </td>
                              <td style={s.td}>{m.email || "—"}</td>
                              <td style={s.td}>{m.nameFromForm}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                {latest.unmatchedRowSummary && latest.unmatchedRowSummary.length > 0 && (
                  <details style={{ marginBottom: "0.25rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--warning)" }}>
                      Not matched ({latest.unmatchedRowSummary.length} shown)
                    </summary>
                    <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
                      <table style={{ ...s.table, fontSize: "0.75rem" }}>
                        <thead>
                          <tr>
                            <th style={s.th}>Row</th>
                            <th style={s.th}>Email (form)</th>
                            <th style={s.th}>Name (form)</th>
                            <th style={s.th}>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latest.unmatchedRowSummary.map((u, i) => (
                            <tr key={i}>
                              <td style={s.td}>{u.rowIndex}</td>
                              <td style={s.td}>{u.email || "—"}</td>
                              <td style={s.td}>{u.nameFromForm}</td>
                              <td style={{ ...s.td, color: "var(--muted)" }}>{u.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            ) : null}

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
                      <th style={s.th}>Matched</th>
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
                          {u.matchedToRosterCount != null && u.unmatchedRowCount != null
                            ? `${u.matchedToRosterCount} / ${u.unmatchedRowCount} unmatch`
                            : "—"}
                        </td>
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
              {upload.rowCount != null ? `${upload.rowCount} data rows` : "Rows"} written;{" "}
              {upload.matchedToRosterCount != null && upload.unmatchedRowCount != null ? (
                <>
                  <strong>{upload.matchedToRosterCount}</strong> matched to roster,{" "}
                  <strong>{upload.unmatchedRowCount}</strong> not matched.
                </>
              ) : (
                <>matched students updated</>
              )}{" "}
              with <code style={{ fontSize: "0.75rem" }}>surveyResponses</code>.
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
