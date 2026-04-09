"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export type HomeworkIngestStudentOption = { id: string; label: string };

type Props =
  | {
      /** Student profile page: student is fixed */
      studentId: string;
      defaultStudentName: string;
      students?: undefined;
    }
  | {
      /** Submissions page: pick student from roster */
      studentId?: undefined;
      defaultStudentName?: undefined;
      students: HomeworkIngestStudentOption[];
    };

export default function HomeworkIngestForm(props: Props) {
  const lockedStudentId = "studentId" in props && props.studentId ? props.studentId : undefined;
  const lockedName = "defaultStudentName" in props ? props.defaultStudentName : undefined;
  const roster = "students" in props ? props.students : undefined;

  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [week, setWeek] = useState("");
  const [videoUrls, setVideoUrls] = useState("");
  const [documentUrls, setDocumentUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    const w = Number(week);
    if (!week.trim() || Number.isNaN(w) || w < 1) {
      setError("Enter a valid week number");
      return;
    }

    const sid = lockedStudentId || selectedStudentId.trim();
    if (!sid) {
      setError("Select a student from the dropdown");
      return;
    }

    const files = fileRef.current?.files;
    const hasFiles = files && files.length > 0;
    const hasVideoUrls = videoUrls.trim().length > 0;
    const hasDocUrls = documentUrls.trim().length > 0;
    if (!hasFiles && !hasVideoUrls && !hasDocUrls) {
      setError("Add at least one file (video and/or PDF/text) and/or paste video URLs and/or document URLs");
      return;
    }

    const displayName =
      lockedStudentId && lockedName
        ? lockedName
        : roster?.find((x) => x.id === sid)?.label || "Student";

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("studentId", sid);
      formData.append("week", String(w));
      formData.append("studentName", displayName);
      formData.append("videoUrls", videoUrls);
      formData.append("documentUrls", documentUrls);
      if (files) {
        for (let i = 0; i < files.length; i++) {
          formData.append("files", files[i]);
        }
      }

      const res = await fetch("/api/admin/homework-ingest", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
        return;
      }
      const vc = typeof data.videoCount === "number" ? data.videoCount : 0;
      const ac = typeof data.attachmentCount === "number" ? data.attachmentCount : 0;
      setDone(
        `Created submission ${data.submissionId} (${vc} video(s), ${ac} document(s)). Cloud Function will transcribe videos and extract PDF/text before grading.`
      );
      if (fileRef.current) fileRef.current.value = "";
      setVideoUrls("");
      setDocumentUrls("");
      if (!lockedStudentId) setSelectedStudentId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
      {roster && roster.length > 0 && (
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
          <span style={{ color: "var(--muted)" }}>Student</span>
          <select
            required={!lockedStudentId}
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            style={{ ...s.select, maxWidth: "100%", width: "min(100%, 28rem)" }}
          >
            <option value="">— Select student —</option>
            {roster.map((st) => (
              <option key={st.id} value={st.id}>
                {st.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
          <span style={{ color: "var(--muted)" }}>Assignment week</span>
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            placeholder="e.g. 3"
            required
            style={{ ...s.input, width: "6rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", flex: "1 1 12rem" }}>
          <span style={{ color: "var(--muted)" }}>Files (videos, PDFs, text, Python, notebooks)</span>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,application/pdf,.pdf,text/plain,.txt,.md,.csv,application/json,.json,text/x-python,.py,application/x-ipynb+json,.ipynb"
            multiple
            style={{ fontSize: "0.8rem" }}
          />
        </label>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
        <span style={{ color: "var(--muted)" }}>
          Video URLs — direct file links only (optional; Yuja/Canvas/player pages will not work)
        </span>
        <textarea
          value={videoUrls}
          onChange={(e) => setVideoUrls(e.target.value)}
          placeholder="https://…/recording.mp4 (not the Yuja watch page)"
          rows={2}
          style={s.textarea}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
        <span style={{ color: "var(--muted)" }}>Document URLs — PDF or text (optional)</span>
        <textarea
          value={documentUrls}
          onChange={(e) => setDocumentUrls(e.target.value)}
          placeholder="https://…pdf, .txt, .py, or .ipynb"
          rows={2}
          style={s.textarea}
        />
      </label>
      <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
        Everything is stored on <strong>ByteScale</strong> first. Videos are transcribed (Gemini); PDFs, plain text, Python (
        <code style={{ fontSize: "0.68rem" }}>.py</code>), and Colab/Jupyter notebooks (<code style={{ fontSize: "0.68rem" }}>.ipynb</code>{" "}
        cell sources) are extracted and combined with the transcription before grading against the week rubric.
      </p>
      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>
          {error}
        </p>
      )}
      {done && (
        <p style={{ color: "var(--success, #2d6a4f)", fontSize: "0.85rem", margin: 0 }}>
          {done}
        </p>
      )}
      <button type="submit" disabled={loading} style={{ ...s.btnPrimary, justifySelf: "start", opacity: loading ? 0.7 : 1 }}>
        {loading ? "Uploading…" : "Submit homework"}
      </button>
    </form>
  );
}
