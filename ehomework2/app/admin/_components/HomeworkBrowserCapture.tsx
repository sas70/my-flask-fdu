"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";
import { getHomeworkCaptureChunkMs } from "@/lib/homework-capture-constants";

export type HomeworkCaptureStudentOption = { id: string; label: string };

type Props =
  | {
      studentId: string;
      defaultStudentName: string;
      students?: undefined;
      initialStudentId?: undefined;
    }
  | {
      studentId?: undefined;
      defaultStudentName?: undefined;
      students: HomeworkCaptureStudentOption[];
      initialStudentId?: string;
    };

type SegmentUploadStatus = "uploading" | "uploaded" | "failed";

type CaptureSegment = {
  index: number;
  timeRange: string;
  minuteLabel: string;
  uploadStatus: SegmentUploadStatus;
  uploadError?: string;
  byteScaleUrl?: string;
  /** From Firestore yuja_funny_urls polling */
  transcriptionStatus?: string;
  transcriptUrl?: string;
  nextStep: string;
};

type YujaProgressState = {
  totalChunks: number;
  chunksWithMedia: number;
  chunksTranscribed: number;
  minRequiredTranscripts: number;
  transcribeRatio: number;
  mergeReady: boolean;
  combinedTranscriptionUrl: string | null;
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return "video/webm;codecs=vp9";
  }
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    return "video/webm;codecs=vp8";
  }
  return "video/webm";
}

function formatMsClock(ms: number) {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const r = totalS % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatSegmentTimes(index: number, chunkMs: number) {
  const startMs = index * chunkMs;
  const endMs = (index + 1) * chunkMs;
  const startMinF = startMs / 60000;
  const endMinF = endMs / 60000;
  return {
    timeRange: `${formatMsClock(startMs)}–${formatMsClock(endMs)}`,
    minuteLabel: `≈ ${startMinF.toFixed(2)}–${endMinF.toFixed(2)} min from start`,
  };
}

function formatSegmentTimesFromOffsets(startMs: number, endMs: number) {
  const startMinF = startMs / 60000;
  const endMinF = endMs / 60000;
  return {
    timeRange: `${formatMsClock(startMs)}–${formatMsClock(endMs)}`,
    minuteLabel: `≈ ${startMinF.toFixed(2)}–${endMinF.toFixed(2)} min from start`,
  };
}

type ResumeChunkRow = {
  chunkIndex: number;
  url: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
};

function segmentsFromResumeChunks(chunks: ResumeChunkRow[], ms: number): CaptureSegment[] {
  return [...chunks]
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((c) => {
      const t =
        typeof c.startOffsetMs === "number" && typeof c.endOffsetMs === "number"
          ? formatSegmentTimesFromOffsets(c.startOffsetMs, c.endOffsetMs)
          : formatSegmentTimes(c.chunkIndex, ms);
      return {
        index: c.chunkIndex,
        timeRange: t.timeRange,
        minuteLabel: t.minuteLabel,
        uploadStatus: "uploaded" as const,
        byteScaleUrl: c.url,
        nextStep: "Resumed from Firestore — continue recording or finalize",
      };
    });
}

export default function HomeworkBrowserCapture(props: Props) {
  const lockedStudentId = "studentId" in props && props.studentId ? props.studentId : undefined;
  const lockedName = "defaultStudentName" in props ? props.defaultStudentName : undefined;
  const roster = "students" in props ? props.students : undefined;
  const initialStudentId = "initialStudentId" in props ? props.initialStudentId : undefined;

  const router = useRouter();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [week, setWeek] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chunkMs, setChunkMs] = useState(getHomeworkCaptureChunkMs());

  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<CaptureSegment[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [loadingFinalize, setLoadingFinalize] = useState(false);
  const [startFreshSession, setStartFreshSession] = useState(false);
  const [loadingResume, setLoadingResume] = useState(false);
  const [yujaProgress, setYujaProgress] = useState<YujaProgressState | null>(null);

  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<{
    status: string;
    transcriptionUrl?: string;
    transcriptionTextPreview?: string;
    gradeReportUrl?: string;
    error?: string;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialStudentId && roster?.some((x) => x.id === initialStudentId)) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId, roster]);

  /** Poll Firestore-backed Yuja segment + merge readiness while a session with reference URL is active. */
  useEffect(() => {
    const sid = sessionId;
    if (!sid || !referenceUrl.trim()) {
      setYujaProgress(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/admin/homework-capture/yuja-status?sessionId=${encodeURIComponent(sid)}`,
          { credentials: "include" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          progress?: YujaProgressState | null;
          segments?: Record<
            string,
            { transcriptUrl?: string; transcriptionStatus?: string; transcriptionError?: string }
          >;
        };
        if (cancelled || !data.ok || !data.progress) return;
        setYujaProgress(data.progress);
        if (data.segments) {
          setSegments((prev) =>
            prev.map((row) => {
              const seg = data.segments![String(row.index)];
              if (!seg) return row;
              const st = seg.transcriptionStatus || "";
              let nextFromYuja = row.nextStep;
              if (row.uploadStatus !== "uploading") {
                if (st === "complete" && seg.transcriptUrl) {
                  nextFromYuja = "Segment transcribed — finalize when done recording";
                } else if (st === "pending") {
                  nextFromYuja = "Transcribing segment (Yuja pipeline)…";
                } else if (st === "failed") {
                  nextFromYuja = `Transcription failed: ${seg.transcriptionError || "error"}`;
                }
              }
              return {
                ...row,
                transcriptionStatus: st,
                transcriptUrl: seg.transcriptUrl,
                nextStep: nextFromYuja,
              };
            })
          );
        }
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, referenceUrl]);

  const upsertSegment = useCallback((index: number, patch: Partial<CaptureSegment>) => {
    setSegments((prev) => {
      const next = [...prev];
      const i = next.findIndex((r) => r.index === index);
      const base: CaptureSegment =
        i >= 0
          ? next[i]
          : {
              index,
              timeRange: "",
              minuteLabel: "",
              uploadStatus: "uploading",
              nextStep: "",
            };
      const t = formatSegmentTimes(index, chunkMs);
      const merged: CaptureSegment = {
        ...base,
        timeRange: t.timeRange,
        minuteLabel: t.minuteLabel,
        ...patch,
      };
      if (i >= 0) next[i] = merged;
      else next.push(merged);
      return next.sort((a, b) => a.index - b.index);
    });
  }, [chunkMs]);

  const uploadChunk = useCallback(
    async (blob: Blob, index: number, sid: string) => {
      const fd = new FormData();
      fd.append("sessionId", sid);
      fd.append("chunkIndex", String(index));
      const type = blob.type || "video/webm";
      fd.append("file", new File([blob], `part_${index}.webm`, { type }));

      const res = await fetch("/api/admin/homework-capture/chunk", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `Chunk upload failed (${res.status})`);
      }
      const url = typeof data.url === "string" ? data.url : undefined;
      upsertSegment(index, {
        uploadStatus: "uploaded",
        byteScaleUrl: url,
        nextStep: referenceUrl.trim()
          ? "Transcribing segment (Yuja pipeline)…"
          : "Awaiting finalize — then Cloud Function will transcribe (no reference URL for segment pipeline)",
      });

      if (referenceUrl.trim()) {
        void fetch("/api/admin/homework-capture/chunk-transcribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, chunkIndex: index }),
        })
          .then(async (tr) => {
            const td = (await tr.json().catch(() => ({}))) as { error?: string; ok?: boolean };
            if (!tr.ok) {
              upsertSegment(index, {
                nextStep:
                  typeof td.error === "string"
                    ? `Segment transcription failed: ${td.error}`
                    : "Segment transcription failed",
              });
              return;
            }
            upsertSegment(index, {
              nextStep: "Segment transcribed — finalize when done recording",
            });
          })
          .catch(() => {
            upsertSegment(index, { nextStep: "Segment transcription request failed (network)" });
          });
      }
    },
    [upsertSegment, referenceUrl]
  );

  async function startSession(): Promise<string | null> {
    setError("");
    setDone("");
    setPipeline(null);
    setLastSubmissionId(null);
    const w = Number(week);
    if (!week.trim() || Number.isNaN(w) || w < 1) {
      setError("Enter a valid week number");
      return null;
    }
    const sid = lockedStudentId || selectedStudentId.trim();
    if (!sid) {
      setError("Select a student");
      return null;
    }
    const displayName =
      lockedStudentId && lockedName ? lockedName : roster?.find((x) => x.id === sid)?.label || "Student";

    const refTrim = referenceUrl.trim();
    const res = await fetch("/api/admin/homework-capture/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: sid,
        week: w,
        studentName: displayName,
        referenceUrl: refTrim || undefined,
        forceNew: startFreshSession,
        resumeIfExists: !startFreshSession && refTrim.length > 0,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      sessionId?: string;
      resumed?: boolean;
      chunkMs?: number;
      chunks?: Array<{ chunkIndex: number; url: string }>;
      nextChunkIndex?: number;
    };
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : `Session failed (${res.status})`);
      return null;
    }
    const id = data.sessionId as string;
    setSessionId(id);
    sessionIdRef.current = id;
    const cms = typeof data.chunkMs === "number" ? data.chunkMs : getHomeworkCaptureChunkMs();
    setChunkMs(cms);

    if (data.resumed && Array.isArray(data.chunks)) {
      const nextIdx =
        typeof data.nextChunkIndex === "number"
          ? data.nextChunkIndex
          : data.chunks.length > 0
            ? Math.max(...data.chunks.map((c) => c.chunkIndex)) + 1
            : 0;
      chunkIndexRef.current = nextIdx;
      if (data.chunks.length > 0) {
        setSegments(segmentsFromResumeChunks(data.chunks, cms));
        setDone(
          `Resumed open session — ${data.chunks.length} segment(s) on ByteScale. Next recording continues at segment ${nextIdx + 1}.`
        );
      } else {
        setSegments([]);
        setDone("Resumed open session — no segments yet. Start recording when ready.");
      }
    } else {
      chunkIndexRef.current = 0;
      setSegments([]);
    }
    return id;
  }

  async function loadSavedProgress() {
    setError("");
    setDone("");
    const w = Number(week);
    if (!week.trim() || Number.isNaN(w) || w < 1) {
      setError("Enter a valid week number");
      return;
    }
    const sid = lockedStudentId || selectedStudentId.trim();
    if (!sid) {
      setError("Select a student");
      return;
    }
    const refTrim = referenceUrl.trim();
    if (!refTrim) {
      setError("Paste the same Yuja / LMS reference URL used before to find your saved session.");
      return;
    }
    setLoadingResume(true);
    try {
      const params = new URLSearchParams({
        studentId: sid,
        week: String(w),
        referenceUrl: refTrim,
      });
      const res = await fetch(`/api/admin/homework-capture/resume?${params}`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sessionId?: string;
        chunkMs?: number;
        chunks?: Array<{ chunkIndex: number; url: string }>;
        nextChunkIndex?: number;
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Lookup failed (${res.status})`);
        return;
      }
      const id = data.sessionId as string;
      const cms = typeof data.chunkMs === "number" ? data.chunkMs : getHomeworkCaptureChunkMs();
      setSessionId(id);
      sessionIdRef.current = id;
      setChunkMs(cms);
      chunkIndexRef.current =
        typeof data.nextChunkIndex === "number"
          ? data.nextChunkIndex
          : (data.chunks?.length ?? 0);
      if (data.chunks && data.chunks.length > 0) {
        setSegments(segmentsFromResumeChunks(data.chunks, cms));
        setDone(
          `Loaded saved session — ${data.chunks.length} segment(s). Next recording starts at segment ${chunkIndexRef.current + 1}.`
        );
      } else {
        setSegments([]);
        setDone("Session found but no segments uploaded yet — start recording when ready.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingResume(false);
    }
  }

  async function startRecording() {
    setError("");
    setDone("");
    try {
      let sid = sessionIdRef.current;
      if (!sid) {
        sid = await startSession();
      }
      if (!sid) return;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;

      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;

      rec.ondataavailable = async (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        const idx = chunkIndexRef.current;
        chunkIndexRef.current += 1;
        upsertSegment(idx, {
          uploadStatus: "uploading",
          nextStep: "Uploading segment to ByteScale…",
        });
        try {
          await uploadChunk(ev.data, idx, sid!);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Chunk upload failed";
          upsertSegment(idx, {
            uploadStatus: "failed",
            uploadError: msg,
            nextStep: "Fix error and record again if needed",
          });
          setError(msg);
          stopTracks();
        }
      };

      rec.addEventListener("stop", () => {
        mediaRecorderRef.current = null;
        stopTracks();
      });

      rec.start(chunkMs);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start display capture");
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
    stopTracks();
  }

  async function finalize() {
    setError("");
    setDone("");
    const sid = sessionIdRef.current;
    if (!sid) {
      setError("No active session");
      return;
    }
    setLoadingFinalize(true);
    try {
      const res = await fetch("/api/admin/homework-capture/finalize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Finalize failed (${res.status})`);
        return;
      }
      const subId = data.submissionId as string;
      setLastSubmissionId(subId);
      setPipeline({ status: "pending" });
      setDone(`Submission ${subId} created. Cloud Function will transcribe and grade.`);
      setSessionId(null);
      sessionIdRef.current = null;
      chunkIndexRef.current = 0;
      setSegments((prev) =>
        prev.map((row) =>
          row.uploadStatus === "uploaded"
            ? { ...row, nextStep: "Queued — Gemini transcription + merge (see pipeline below)" }
            : row
        )
      );
      if (!lockedStudentId) setSelectedStudentId("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingFinalize(false);
    }
  }

  useEffect(() => {
    if (!lastSubmissionId) return;
    let cancelled = false;
    let n = 0;
    const max = 45;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled || n >= max) return;
      n += 1;
      try {
        const res = await fetch(`/api/admin/submissions/${lastSubmissionId}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const st = typeof data.status === "string" ? data.status : "";
        setPipeline({
          status: st,
          transcriptionUrl: data.transcriptionUrl as string | undefined,
          transcriptionTextPreview:
            typeof data.transcriptionText === "string" ? data.transcriptionText.slice(0, 120) + "…" : undefined,
          gradeReportUrl: data.gradeReportUrl as string | undefined,
          error: data.error as string | undefined,
        });
        const terminal = ["graded", "transcription_failed", "grading_failed"].includes(st);
        if (!terminal && !cancelled) {
          timeoutId = setTimeout(poll, 4000);
        }
      } catch {
        if (!cancelled) timeoutId = setTimeout(poll, 4000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [lastSubmissionId]);

  const uploadedCount = segments.filter((r) => r.uploadStatus === "uploaded").length;
  const anyFailed = segments.some((r) => r.uploadStatus === "failed");

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {lockedStudentId && lockedName && (
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
          Student: <strong>{lockedName}</strong>
        </p>
      )}
      {roster && roster.length > 0 && !lockedStudentId && (
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
          <span style={{ color: "var(--muted)" }}>Student</span>
          <select
            required={!lockedStudentId}
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            disabled={!!sessionId}
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
          <span style={{ color: "var(--muted)" }}>Week</span>
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            disabled={!!sessionId}
            style={{ ...s.input, width: "6rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", flex: "1 1 14rem" }}>
          <span style={{ color: "var(--muted)" }}>Reference URL (Yuja / LMS player link)</span>
          <input
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            disabled={!!sessionId}
            placeholder="Used to match a saved session if you stop mid-video"
            style={s.input}
          />
        </label>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.5rem",
          fontSize: "0.8rem",
          color: "var(--muted)",
          cursor: sessionId ? "default" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={startFreshSession}
          disabled={!!sessionId}
          onChange={(e) => setStartFreshSession(e.target.checked)}
          style={{ marginTop: "0.15rem" }}
        />
        <span>
          Start a <strong>new</strong> session (do not resume) — same student + week + URL otherwise reuses an{" "}
          <strong>open</strong> Firestore session and continues chunk indices.
        </span>
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => void loadSavedProgress()}
          disabled={!!sessionId || loadingResume}
          style={{ ...s.btnGhost, fontSize: "0.82rem" }}
        >
          {loadingResume ? "Loading…" : "Load saved progress only"}
        </button>
        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          Fetches segment table from Firestore without starting the recorder (needs student, week, and reference URL).
        </span>
      </div>

      <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
        Share your <strong>tab</strong> with audio when prompted (Chrome). Recording is split every{" "}
        <strong>{Math.round(chunkMs / 1000)}s</strong>. If uploads fail with 413, set{" "}
        <code style={{ fontSize: "0.65rem" }}>NEXT_PUBLIC_HOMEWORK_CAPTURE_CHUNK_MS=45000</code> in{" "}
        <code style={{ fontSize: "0.65rem" }}>.env.local</code>.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        {!recording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            style={{ ...s.btnPrimary, opacity: loadingFinalize ? 0.6 : 1 }}
            disabled={loadingFinalize}
          >
            {sessionId ? "Start recording tab" : "Create session & record"}
          </button>
        ) : (
          <button type="button" onClick={() => void stopRecording()} style={s.btnPrimary}>
            Stop recording
          </button>
        )}
        <button
          type="button"
          onClick={() => void finalize()}
          disabled={!sessionId || recording || uploadedCount === 0 || loadingFinalize}
          style={{ ...s.btnGhost, opacity: sessionId && !recording && uploadedCount > 0 ? 1 : 0.5 }}
        >
          {loadingFinalize ? "Finalizing…" : "Finalize & create submission"}
        </button>
      </div>

      {anyFailed && (
        <p style={{ fontSize: "0.8rem", color: "var(--danger)", margin: 0 }}>
          One or more segments failed to upload. Fix the issue (e.g. chunk size / network), start a new session, and record
          again.
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Timeline</th>
              <th style={s.th}>Minute span</th>
              <th style={s.th}>Upload</th>
              <th style={s.th}>ByteScale segment</th>
              <th style={s.th}>Transcript (.txt)</th>
              <th style={s.th}>Next step</th>
            </tr>
          </thead>
          <tbody>
            {segments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...s.td, color: "var(--muted)", fontStyle: "italic" }}>
                  No segments yet. Start recording and pick the tab where the LMS video plays.
                </td>
              </tr>
            ) : (
              segments.map((row) => (
                <tr key={row.index}>
                  <td style={s.td}>{row.index + 1}</td>
                  <td style={{ ...s.td, fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }}>{row.timeRange}</td>
                  <td style={{ ...s.td, fontSize: "0.82rem", color: "var(--muted)" }}>{row.minuteLabel}</td>
                  <td style={s.td}>
                    {row.uploadStatus === "uploading" && (
                      <span style={{ color: "var(--accent)" }}>Uploading…</span>
                    )}
                    {row.uploadStatus === "uploaded" && (
                      <span style={{ color: "var(--success, #2d6a4f)" }}>Uploaded</span>
                    )}
                    {row.uploadStatus === "failed" && (
                      <span style={{ color: "var(--danger)" }} title={row.uploadError}>
                        Failed
                      </span>
                    )}
                  </td>
                  <td style={s.td}>
                    {row.byteScaleUrl ? (
                      <a
                        href={row.byteScaleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "0.75rem", wordBreak: "break-all" }}
                      >
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={s.td}>
                    {row.transcriptUrl ? (
                      <a
                        href={row.transcriptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "0.75rem", wordBreak: "break-all" }}
                      >
                        Open
                      </a>
                    ) : row.transcriptionStatus === "pending" ? (
                      <span style={{ fontSize: "0.78rem", color: "var(--accent)" }}>Pending…</span>
                    ) : row.transcriptionStatus === "failed" ? (
                      <span style={{ fontSize: "0.78rem", color: "var(--danger)" }}>Failed</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ ...s.td, fontSize: "0.8rem", maxWidth: "12rem" }}>{row.nextStep}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: 0 }}>
        Session: {sessionId ? `${sessionId.slice(0, 10)}…` : "—"} · Segments: {segments.length} · Uploaded: {uploadedCount}
        {yujaProgress && referenceUrl.trim() ? (
          <>
            {" "}
            · Yuja doc:{" "}
            <strong>
              {yujaProgress.chunksTranscribed}/{yujaProgress.totalChunks}
            </strong>{" "}
            segments transcribed (need ≥{yujaProgress.minRequiredTranscripts} at ~90%) · Merge-ready:{" "}
            <strong>{yujaProgress.mergeReady ? "yes" : "no"}</strong>
            {yujaProgress.combinedTranscriptionUrl ? (
              <>
                {" "}
                · Combined:{" "}
                <a
                  href={yujaProgress.combinedTranscriptionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  open
                </a>
              </>
            ) : null}
          </>
        ) : null}
      </p>

      {lastSubmissionId && pipeline && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "1rem",
            background: "var(--surface-elevated, rgba(0,0,0,0.2))",
          }}
        >
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Submission pipeline</h3>
          <table style={s.table}>
            <tbody>
              <tr>
                <td style={{ ...s.td, fontWeight: 600, width: "11rem" }}>Homework submission</td>
                <td style={s.td}>
                  <Link href={`/admin/submissions/${lastSubmissionId}`} style={{ color: "var(--accent)" }}>
                    {lastSubmissionId}
                  </Link>
                </td>
              </tr>
              <tr>
                <td style={{ ...s.td, fontWeight: 600 }}>Firestore status</td>
                <td style={s.td}>{pipeline.status || "—"}</td>
              </tr>
              <tr>
                <td style={{ ...s.td, fontWeight: 600 }}>Combined transcript (.txt on ByteScale)</td>
                <td style={s.td}>
                  {pipeline.transcriptionUrl ? (
                    <a href={pipeline.transcriptionUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem" }}>
                      Open full text
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>Waiting for Cloud Function…</span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.td, fontWeight: 600 }}>Grade report JSON (ByteScale)</td>
                <td style={s.td}>
                  {pipeline.gradeReportUrl ? (
                    <a href={pipeline.gradeReportUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem" }}>
                      Open
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
              </tr>
              {pipeline.error && (
                <tr>
                  <td style={{ ...s.td, fontWeight: 600, color: "var(--danger)" }}>Error</td>
                  <td style={{ ...s.td, color: "var(--danger)", fontSize: "0.8rem" }}>{pipeline.error}</td>
                </tr>
              )}
            </tbody>
          </table>
          {pipeline.transcriptionTextPreview && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0.75rem 0 0", fontFamily: "ui-monospace, monospace" }}>
              Preview: {pipeline.transcriptionTextPreview}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>
          {error}
        </p>
      )}
      {done && (
        <p style={{ color: "var(--success, #2d6a4f)", fontSize: "0.85rem", margin: 0 }}>{done}</p>
      )}
    </div>
  );
}
