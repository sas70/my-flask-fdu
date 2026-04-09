"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as s from "@/lib/admin-styles";

interface UploadRow {
  id: string;
  fileName: string | null;
  textUrl: string | null;
  status: string;
  parsedStudentCount: number | null;
  matchedCount: number | null;
  unmatchedCount: number | null;
  unmatchedSample: string[] | null;
  error: string | null;
  uploadedAt: string | null;
  processedAt: string | null;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Waiting for Cloud Function";
    case "processing":
      return "AI parsing & matching…";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export default function StudentIntroductionUpload() {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/students-introduction", {
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

  useEffect(() => {
    const needsPoll = uploads.some(
      (u) => u.status === "pending" || u.status === "processing"
    );
    if (needsPoll) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => load(), 2000);
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
      setError("Select a .txt file");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/students-introduction", {
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

  const latest = uploads[0];

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading status…</p>;
  }

  return (
    <div style={{ ...s.card, marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
        Student introductions (.txt)
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        One plain-text file with multiple students’ bios or self-introductions (any layout: names on
        their own line, sections, etc.). The file is stored on ByteScale; a Cloud Function fetches it,
        uses Claude to extract each student’s name and introduction, then fuzzy-matches{" "}
        <strong>first + last name</strong> to your roster and writes the text into each student’s{" "}
        <code style={{ fontSize: "0.8rem" }}>bio</code> field. Existing bios are overwritten for
        matched students. After bios update, the usual instructor profile summary may run.
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
            accept=".txt,text/plain"
            style={{ fontSize: "0.85rem", color: "var(--muted)" }}
          />
          <button
            type="submit"
            disabled={uploading}
            style={{ ...s.btnPrimary, opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? "Uploading…" : "Upload .txt"}
          </button>
        </div>
      </form>

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
          <code style={{ fontSize: "0.75rem" }}>onStudentsIntroductionUploadCreated</code> runs when a
          document is added to <code style={{ fontSize: "0.75rem" }}>students_introduction</code>.
          Refreshes every 2s while pending or processing.
        </p>

        {!latest ? (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
            No uploads yet. Add a .txt file above.
          </p>
        ) : (
          <>
            <IntroductionPipelineSteps upload={latest} />

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

            {latest.unmatchedSample && latest.unmatchedSample.length > 0 && latest.status === "complete" && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                <strong style={{ color: "var(--foreground)" }}>Unmatched names (sample):</strong>{" "}
                {latest.unmatchedSample.join(", ")}
                {latest.unmatchedCount != null && latest.unmatchedCount > latest.unmatchedSample.length
                  ? ` … (+${latest.unmatchedCount - latest.unmatchedSample.length} more)`
                  : ""}
              </div>
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
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Parsed</th>
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
                        <td style={s.td}>{u.parsedStudentCount ?? "—"}</td>
                        <td style={s.td}>{u.matchedCount ?? "—"}</td>
                        <td style={s.td}>
                          {u.textUrl ? (
                            <a href={u.textUrl} target="_blank" rel="noopener noreferrer">
                              File
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

function IntroductionPipelineSteps({ upload }: { upload: UploadRow }) {
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
          <strong>Text file stored</strong> — URL saved on <code style={{ fontSize: "0.75rem" }}>students_introduction</code>
          {step1Done && <span style={{ color: "var(--success, #2d6a4f)" }}> ✓</span>}
        </li>
        <li style={{ color: step2Done || step2Active ? "var(--foreground)" : "var(--muted)" }}>
          <strong>Parser function</strong> —{" "}
          {st === "pending" && <>Queued…</>}
          {st === "processing" && (
            <>Claude extracting students + fuzzy-matching roster… <span style={{ color: "var(--accent)" }}>●</span></>
          )}
          {st === "complete" && <>Done. <span style={{ color: "var(--success, #2d6a4f)" }}>✓</span></>}
          {st === "failed" && <>Error. <span style={{ color: "var(--danger)" }}>✗</span></>}
          {!["pending", "processing", "complete", "failed"].includes(st) && (
            <span style={s.badgeStyle("pending")}>{st}</span>
          )}
        </li>
        <li style={{ color: step3Done ? "var(--foreground)" : "var(--muted)" }}>
          <strong>Roster updates</strong> —{" "}
          {step3Done ? (
            <>
              {upload.matchedCount != null ? `${upload.matchedCount} students` : "Students"} updated (
              <code style={{ fontSize: "0.75rem" }}>bio</code>
              {upload.parsedStudentCount != null && (
                <span>
                  {" "}
                  from {upload.parsedStudentCount} extracted
                </span>
              )}
              ).
              {upload.processedAt && (
                <span style={{ color: "var(--muted)" }}>
                  {" "}
                  {new Date(upload.processedAt).toLocaleString()}
                </span>
              )}
              <span style={{ color: "var(--success, #2d6a4f)" }}> ✓</span>
            </>
          ) : st === "failed" ? (
            <>Skipped.</>
          ) : (
            <>Pending.</>
          )}
        </li>
      </ol>
    </div>
  );
}
