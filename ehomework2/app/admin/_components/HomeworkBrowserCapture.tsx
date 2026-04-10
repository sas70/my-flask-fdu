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
type TranscriptStatus = "" | "pending" | "complete" | "failed";

type CaptureSegment = {
  index: number;
  timeRange: string;
  minuteLabel: string;
  uploadStatus: SegmentUploadStatus;
  uploadError?: string;
  byteScaleUrl?: string;
  transcriptionStatus: TranscriptStatus;
  transcriptionError?: string;
  transcriptUrl?: string;
  nextStep: string;
};

type YujaProgressState = {
  totalChunks: number;
  chunksWithMedia: number;
  chunksTranscribed: number;
  chunksFailed: number;
  minRequiredTranscripts: number;
  transcribeRatio: number;
  mergeReady: boolean;
  combinedTranscriptionUrl: string | null;
  failedChunkIndices: number[];
  missingChunkIndices: number[];
};

type YujaSegmentApi = {
  chunkUrl?: string;
  chunkMimeType?: string;
  transcriptUrl?: string;
  transcriptionStatus?: string;
  transcriptionError?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
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

function segmentsFromYujaApi(
  apiSegments: Record<string, YujaSegmentApi>,
  totalChunks: number,
  chunkMs: number
): CaptureSegment[] {
  const rows: CaptureSegment[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const seg = apiSegments[String(i)] || {};
    const t =
      typeof seg.startOffsetMs === "number" && typeof seg.endOffsetMs === "number"
        ? formatSegmentTimesFromOffsets(seg.startOffsetMs, seg.endOffsetMs)
        : formatSegmentTimes(i, chunkMs);

    let uploadStatus: SegmentUploadStatus = "uploaded";
    let nextStep = "Segment on ByteScale";
    if (!seg.chunkUrl) {
      uploadStatus = "failed";
      nextStep = "Missing chunk — re-record this segment";
    }

    const rawStatus = (seg.transcriptionStatus || "") as string;
    const transcriptionStatus: TranscriptStatus =
      rawStatus === "complete" || rawStatus === "pending" || rawStatus === "failed"
        ? rawStatus
        : "";

    if (seg.chunkUrl) {
      if (transcriptionStatus === "complete" && seg.transcriptUrl) {
        nextStep = "Transcribed ✓";
      } else if (transcriptionStatus === "pending") {
        nextStep = "Transcribing…";
      } else if (transcriptionStatus === "failed") {
        nextStep = `Transcription failed — retry`;
      } else {
        nextStep = "Awaiting transcription";
      }
    }

    rows.push({
      index: i,
      timeRange: t.timeRange,
      minuteLabel: t.minuteLabel,
      uploadStatus,
      byteScaleUrl: seg.chunkUrl,
      transcriptionStatus,
      transcriptionError: seg.transcriptionError,
      transcriptUrl: seg.transcriptUrl,
      nextStep,
    });
  }
  return rows;
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
  const [yujaDocId, setYujaDocId] = useState<string | null>(null);
  const [chunkMs, setChunkMs] = useState(getHomeworkCaptureChunkMs());

  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<CaptureSegment[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [loadingFinalize, setLoadingFinalize] = useState(false);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [loadingRetry, setLoadingRetry] = useState(false);
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
  const referenceUrlRef = useRef("");

  useEffect(() => {
    referenceUrlRef.current = referenceUrl;
  }, [referenceUrl]);

  useEffect(() => {
    if (initialStudentId && roster?.some((x) => x.id === initialStudentId)) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId, roster]);

  /** Load yuja doc state for the current URL (no recording, no create). */
  const loadYujaState = useCallback(
    async (url: string, opts?: { create?: boolean; silent?: boolean }): Promise<boolean> => {
      const u = url.trim();
      if (!u) {
        setYujaDocId(null);
        setSegments([]);
        setYujaProgress(null);
        return false;
      }
      if (!opts?.silent) {
        setLoadingLookup(true);
        setError("");
      }
      try {
        const qs = new URLSearchParams({ url: u });
        if (opts?.create) qs.set("create", "1");
        const res = await fetch(`/api/admin/homework-capture/yuja-state?${qs}`, {
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          yujaFunnyUrlsDocId?: string;
          exists?: boolean;
          chunkMs?: number;
          segments?: Record<string, YujaSegmentApi>;
          progress?: YujaProgressState;
          nextChunkIndex?: number;
        };
        if (!res.ok || !data.ok) {
          if (!opts?.silent) {
            setError(typeof data.error === "string" ? data.error : `Lookup failed (${res.status})`);
          }
          return false;
        }
        const cms = typeof data.chunkMs === "number" ? data.chunkMs : getHomeworkCaptureChunkMs();
        setChunkMs(cms);
        setYujaDocId(data.yujaFunnyUrlsDocId || null);
        if (data.progress) {
          setYujaProgress(data.progress);
          const total = data.progress.totalChunks;
          const rows = segmentsFromYujaApi(data.segments || {}, total, cms);
          setSegments(rows);
          chunkIndexRef.current = data.nextChunkIndex ?? total;
        } else {
          setYujaProgress(null);
          setSegments([]);
          chunkIndexRef.current = 0;
        }
        return true;
      } catch (e) {
        if (!opts?.silent) {
          setError(e instanceof Error ? e.message : "Network error");
        }
        return false;
      } finally {
        if (!opts?.silent) setLoadingLookup(false);
      }
    },
    []
  );

  /** Auto-refresh yuja state while the URL is set and we're not recording. */
  useEffect(() => {
    const u = referenceUrl.trim();
    if (!u) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || recording) return;
      await loadYujaState(u, { silent: true });
    };
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [referenceUrl, recording, loadYujaState]);

  const upsertSegment = useCallback(
    (index: number, patch: Partial<CaptureSegment>) => {
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
                transcriptionStatus: "",
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
    },
    [chunkMs]
  );

  const uploadChunk = useCallback(
    async (blob: Blob, index: number, url: string) => {
      const fd = new FormData();
      fd.append("url", url);
      fd.append("chunkIndex", String(index));
      const type = blob.type || "video/webm";
      fd.append("file", new File([blob], `part_${index}.webm`, { type }));

      const res = await fetch("/api/admin/homework-capture/chunk", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        yujaFunnyUrlsDocId?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : `Chunk upload failed (${res.status})`
        );
      }
      const segUrl = typeof data.url === "string" ? data.url : undefined;
      if (data.yujaFunnyUrlsDocId) setYujaDocId(data.yujaFunnyUrlsDocId);
      upsertSegment(index, {
        uploadStatus: "uploaded",
        byteScaleUrl: segUrl,
        transcriptionStatus: "pending",
        nextStep: "Transcribing…",
      });

      // Fire-and-forget transcription.
      void fetch("/api/admin/homework-capture/chunk-transcribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, chunkIndex: index }),
      })
        .then(async (tr) => {
          const td = (await tr.json().catch(() => ({}))) as { error?: string; transcriptUrl?: string };
          if (!tr.ok) {
            upsertSegment(index, {
              transcriptionStatus: "failed",
              transcriptionError: td.error || "Segment transcription failed",
              nextStep: `Transcription failed — retry`,
            });
            return;
          }
          upsertSegment(index, {
            transcriptionStatus: "complete",
            transcriptUrl: td.transcriptUrl,
            nextStep: "Transcribed ✓",
          });
        })
        .catch(() => {
          upsertSegment(index, {
            transcriptionStatus: "failed",
            nextStep: "Transcription request failed (network)",
          });
        });
    },
    [upsertSegment]
  );

  async function startRecording() {
    setError("");
    setDone("");
    const u = referenceUrl.trim();
    if (!u) {
      setError("Paste the Yuja / LMS reference URL first — it's the identity of this recording.");
      return;
    }

    // Ensure the yuja doc exists and pull current state (so we resume at the right index).
    const ok = await loadYujaState(u, { create: true });
    if (!ok) return;

    try {
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
          nextStep: "Uploading…",
        });
        try {
          await uploadChunk(ev.data, idx, referenceUrlRef.current || u);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Chunk upload failed";
          upsertSegment(idx, {
            uploadStatus: "failed",
            uploadError: msg,
            nextStep: "Upload failed — stop and start again",
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

  async function retryFailedTranscriptions() {
    setError("");
    setDone("");
    const u = referenceUrl.trim();
    if (!u) {
      setError("Paste the reference URL first");
      return;
    }
    setLoadingRetry(true);
    try {
      const res = await fetch("/api/admin/homework-capture/retry-failed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        retried?: Array<{ chunkIndex: number }>;
        stillFailed?: Array<{ chunkIndex: number }>;
        attempted?: number;
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Retry failed (${res.status})`);
        return;
      }
      const okCount = data.retried?.length || 0;
      const failCount = data.stillFailed?.length || 0;
      setDone(
        `Retried ${data.attempted || 0} segment(s): ${okCount} succeeded, ${failCount} still failed.`
      );
      await loadYujaState(u, { silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingRetry(false);
    }
  }

  async function finalize() {
    setError("");
    setDone("");
    const u = referenceUrl.trim();
    if (!u) {
      setError("Reference URL is required to finalize");
      return;
    }
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

    setLoadingFinalize(true);
    try {
      const res = await fetch("/api/admin/homework-capture/finalize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u, studentId: sid, week: w }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        submissionId?: string;
        combinedTranscriptionUrl?: string;
        videoCount?: number;
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Finalize failed (${res.status})`);
        return;
      }
      const subId = data.submissionId as string;
      setLastSubmissionId(subId);
      setPipeline({ status: "pending" });
      setDone(`Submission ${subId} created. Cloud Function will grade using the pre-merged transcript.`);
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
        const res = await fetch(`/api/admin/submissions/${lastSubmissionId}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const st = typeof data.status === "string" ? data.status : "";
        setPipeline({
          status: st,
          transcriptionUrl: data.transcriptionUrl as string | undefined,
          transcriptionTextPreview:
            typeof data.transcriptionText === "string"
              ? data.transcriptionText.slice(0, 120) + "…"
              : undefined,
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

  const totalChunks = yujaProgress?.totalChunks ?? 0;
  const chunksTranscribed = yujaProgress?.chunksTranscribed ?? 0;
  const anyFailed = (yujaProgress?.chunksFailed ?? 0) > 0;
  const mergeReady = !!yujaProgress?.mergeReady;

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
          <span style={{ color: "var(--muted)" }}>Week</span>
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            style={{ ...s.input, width: "6rem" }}
          />
        </label>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            fontSize: "0.8rem",
            flex: "1 1 14rem",
          }}
        >
          <span style={{ color: "var(--muted)" }}>Reference URL (Yuja / LMS player link)</span>
          <input
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            onBlur={() => {
              const u = referenceUrl.trim();
              if (u) void loadYujaState(u);
            }}
            placeholder="This URL is the identity of the recording (sha256 → doc id)"
            style={s.input}
          />
        </label>
        <button
          type="button"
          onClick={() => void loadYujaState(referenceUrl)}
          disabled={loadingLookup || !referenceUrl.trim()}
          style={{ ...s.btnGhost, fontSize: "0.82rem" }}
        >
          {loadingLookup ? "Loading…" : "Check status"}
        </button>
      </div>

      <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
        Share your <strong>tab</strong> with audio when prompted (Chrome). Recording splits every{" "}
        <strong>{Math.round(chunkMs / 1000)}s</strong>. The URL is the key — if you paste a URL that
        already has segments, recording resumes at the next chunk index. If you paste a URL with
        ≥90% coverage you&apos;re ready to finalize.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        {!recording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={loadingFinalize || loadingRetry || !referenceUrl.trim()}
            style={{ ...s.btnPrimary, opacity: loadingFinalize || loadingRetry ? 0.6 : 1 }}
          >
            {totalChunks > 0 ? `Resume recording at chunk ${chunkIndexRef.current + 1}` : "Start recording tab"}
          </button>
        ) : (
          <button type="button" onClick={() => void stopRecording()} style={s.btnPrimary}>
            Stop recording
          </button>
        )}
        <button
          type="button"
          onClick={() => void retryFailedTranscriptions()}
          disabled={recording || loadingRetry || !anyFailed}
          style={{ ...s.btnGhost, opacity: anyFailed && !recording ? 1 : 0.5 }}
        >
          {loadingRetry ? "Retrying…" : "Retry failed transcriptions"}
        </button>
        <button
          type="button"
          onClick={() => void finalize()}
          disabled={!mergeReady || recording || loadingFinalize}
          style={{ ...s.btnGhost, opacity: mergeReady && !recording ? 1 : 0.5 }}
        >
          {loadingFinalize ? "Finalizing…" : "Finalize & create submission"}
        </button>
      </div>

      {yujaProgress && totalChunks > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
            fontSize: "0.82rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: "var(--surface, rgba(0,0,0,0.2))",
            border: "1px solid var(--border)",
          }}
        >
          <span>
            Coverage:{" "}
            <strong>
              {chunksTranscribed}/{totalChunks}
            </strong>{" "}
            ({Math.round(yujaProgress.transcribeRatio * 100)}%)
          </span>
          <span>
            Need ≥<strong>{yujaProgress.minRequiredTranscripts}</strong> for merge
          </span>
          {mergeReady ? (
            <span style={{ color: "var(--success, #3fb950)" }}>✓ Ready to finalize</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>Keep recording or retry failed</span>
          )}
          {yujaProgress.failedChunkIndices.length > 0 && (
            <span style={{ color: "var(--danger)" }}>
              Failed: {yujaProgress.failedChunkIndices.join(", ")}
            </span>
          )}
          {yujaProgress.combinedTranscriptionUrl && (
            <a
              href={yujaProgress.combinedTranscriptionUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              Open merged transcript
            </a>
          )}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Timeline</th>
              <th style={s.th}>Minute span</th>
              <th style={s.th}>Chunk</th>
              <th style={s.th}>Transcript</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {segments.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...s.td, color: "var(--muted)", fontStyle: "italic" }}>
                  {referenceUrl.trim()
                    ? "No segments yet for this URL. Start recording."
                    : "Paste a reference URL to check its state."}
                </td>
              </tr>
            ) : (
              segments.map((row) => (
                <tr key={row.index}>
                  <td style={s.td}>{row.index + 1}</td>
                  <td style={{ ...s.td, fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }}>
                    {row.timeRange}
                  </td>
                  <td style={{ ...s.td, fontSize: "0.82rem", color: "var(--muted)" }}>
                    {row.minuteLabel}
                  </td>
                  <td style={s.td}>
                    {row.byteScaleUrl ? (
                      <a
                        href={row.byteScaleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "0.75rem" }}
                      >
                        Open
                      </a>
                    ) : row.uploadStatus === "uploading" ? (
                      <span style={{ color: "var(--accent)" }}>Uploading…</span>
                    ) : row.uploadStatus === "failed" ? (
                      <span style={{ color: "var(--danger)" }} title={row.uploadError}>
                        Missing
                      </span>
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
                        style={{ fontSize: "0.75rem" }}
                      >
                        Open
                      </a>
                    ) : row.transcriptionStatus === "pending" ? (
                      <span style={{ fontSize: "0.78rem", color: "var(--accent)" }}>Pending…</span>
                    ) : row.transcriptionStatus === "failed" ? (
                      <span style={{ fontSize: "0.78rem", color: "var(--danger)" }} title={row.transcriptionError}>
                        Failed
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ ...s.td, fontSize: "0.8rem", maxWidth: "14rem" }}>{row.nextStep}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {yujaDocId && (
        <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0, fontFamily: "ui-monospace, monospace" }}>
          yuja_funny_urls/{yujaDocId.slice(0, 16)}…
        </p>
      )}

      {lastSubmissionId && pipeline && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "1rem",
            background: "var(--surface, rgba(0,0,0,0.2))",
          }}
        >
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
            Submission pipeline
          </h3>
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
                <td style={{ ...s.td, fontWeight: 600 }}>Combined transcript</td>
                <td style={s.td}>
                  {pipeline.transcriptionUrl ? (
                    <a
                      href={pipeline.transcriptionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.85rem" }}
                    >
                      Open full text
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>Waiting for Cloud Function…</span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.td, fontWeight: 600 }}>Grade report JSON</td>
                <td style={s.td}>
                  {pipeline.gradeReportUrl ? (
                    <a
                      href={pipeline.gradeReportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.85rem" }}
                    >
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
            <p
              style={{
                fontSize: "0.72rem",
                color: "var(--muted)",
                margin: "0.75rem 0 0",
                fontFamily: "ui-monospace, monospace",
              }}
            >
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
      {done && <p style={{ color: "var(--success, #3fb950)", fontSize: "0.85rem", margin: 0 }}>{done}</p>}
    </div>
  );
}
