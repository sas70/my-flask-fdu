import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalizeHomeworkCaptureReferenceUrl } from "@/lib/homework-capture-reference-url";
import { referencePlaybackUrlKeyToYujaDocId } from "@/lib/yuja-funny-urls-id";

export { referencePlaybackUrlKeyToYujaDocId };

/**
 * Firestore collection: ONE doc per normalized video URL.
 *
 * First principle: the doc id depends only on the URL — never on student, week,
 * or any other axis. The doc is the single source of truth for everything we know
 * about a specific video URL (recorded chunks, per-segment transcripts, merged
 * walkthrough). The old "capture session" concept is gone: if two recordings
 * happen against the same URL, the newer one overwrites the older one in this doc.
 */
export const YUJA_FUNNY_URLS = "yuja_funny_urls";

/** Minimum fraction of chunks that must have segment transcripts before merge. */
export const YUJA_MERGE_DEFAULT_MIN_RATIO = 0.9;

export function requiredTranscriptCount(chunkCount: number, minRatio: number): number {
  if (chunkCount <= 0) return 0;
  return Math.max(1, Math.ceil(chunkCount * minRatio - 1e-12));
}

export type YujaSegmentRecord = {
  chunkUrl?: string;
  chunkMimeType?: string;
  chunkName?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
  durationMs?: number;
  chunkLengthNominalMs?: number;
  durationSource?: "nominal" | "client";
  transcriptUrl?: string;
  transcriptionStatus?: "pending" | "complete" | "failed";
  transcriptionError?: string;
};

export type YujaDocData = {
  referencePlaybackUrl: string;
  referencePlaybackUrlKey: string;
  chunkMs?: number;
  /** When set, merge/coverage use ceil(sourceDurationMs / chunkMs) segments, not max segment index. */
  sourceDurationMs?: number;
  segments?: Record<string, YujaSegmentRecord>;
  combinedTranscriptionUrl?: string;
  combinedTranscriptionStatus?: "complete";
  mergedAt?: FirebaseFirestore.Timestamp;
  lastMergedSegmentCount?: number;
  lastMergeOmittedChunkIndices?: number[];
  lastMergeMinRatio?: number;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
};

export type YujaProgress = {
  /** Segments required for merge/coverage: from source video length if set, else recorded span. */
  mergeTargetChunks: number;
  /** Max segment index in Firestore + 1 (may exceed merge target if over-recorded). */
  recordedSpanChunks: number;
  chunksWithMedia: number;
  chunksTranscribed: number;
  chunksFailed: number;
  minRequiredTranscripts: number;
  transcribeRatio: number;
  mergeReady: boolean;
  combinedTranscriptionUrl: string | null;
  failedChunkIndices: number[];
  missingChunkIndices: number[];
  /** True when merge target comes from `sourceDurationMs` on the doc. */
  mergeTargetFromSourceDuration: boolean;
  /** 0-based index to record next. */
  nextRecordChunkIndex: number;
};

/**
 * Compute progress/coverage for a yuja doc.
 *
 * **Merge/coverage denominator** = `mergeTargetChunks`: `ceil(sourceDurationMs/chunkMs)` when
 * `sourceDurationMs` is set (actual Yuja video length), otherwise the recorded span
 * (max segment index + 1). That way over-recorded extra slots do not inflate “need ≥N”.
 *
 * **Resume index** = first missing/failed within the merge window, else fill the next slot
 * up to `mergeTargetChunks`, else stop at the merge target when duration is known.
 */
export function computeYujaProgress(
  segments: Record<string, YujaSegmentRecord> | undefined,
  combinedTranscriptionUrl: string | null | undefined,
  minRatio: number = YUJA_MERGE_DEFAULT_MIN_RATIO,
  opts?: { chunkMs: number; sourceDurationMs?: number | null }
): YujaProgress {
  const seg = segments || {};
  const keys = Object.keys(seg)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);

  const recordedSpanChunks = keys.length === 0 ? 0 : Math.max(...keys) + 1;
  const chunkMs =
    opts?.chunkMs && Number.isFinite(opts.chunkMs) && opts.chunkMs > 0 ? opts.chunkMs : 60_000;
  const src = opts?.sourceDurationMs;
  const mergeTargetFromSourceDuration =
    src != null && Number.isFinite(src) && src > 0;
  const mergeTargetChunks = mergeTargetFromSourceDuration
    ? Math.max(1, Math.ceil(src / chunkMs))
    : recordedSpanChunks;

  let chunksWithMedia = 0;
  let chunksTranscribed = 0;
  let chunksFailed = 0;
  const failedChunkIndices: number[] = [];
  const missingChunkIndices: number[] = [];

  for (let i = 0; i < mergeTargetChunks; i++) {
    const s = seg[String(i)];
    if (!s) {
      missingChunkIndices.push(i);
      continue;
    }
    if (!s.chunkUrl) {
      missingChunkIndices.push(i);
      continue;
    }
    chunksWithMedia += 1;
    if (s.transcriptUrl) {
      chunksTranscribed += 1;
    } else if (s.transcriptionStatus === "failed") {
      chunksFailed += 1;
      failedChunkIndices.push(i);
    }
  }

  const minRequired = requiredTranscriptCount(mergeTargetChunks, minRatio);
  const transcribeRatio =
    mergeTargetChunks > 0 ? chunksTranscribed / mergeTargetChunks : 0;
  const mergeReady = mergeTargetChunks > 0 && chunksTranscribed >= minRequired;

  const resumeHeads: number[] = [];
  if (missingChunkIndices.length) resumeHeads.push(Math.min(...missingChunkIndices));
  if (failedChunkIndices.length) resumeHeads.push(Math.min(...failedChunkIndices));

  let nextRecordChunkIndex: number;
  if (resumeHeads.length > 0) {
    nextRecordChunkIndex = Math.min(...resumeHeads);
  } else if (mergeTargetChunks === 0) {
    nextRecordChunkIndex = 0;
  } else if (mergeTargetFromSourceDuration) {
    if (recordedSpanChunks < mergeTargetChunks) {
      nextRecordChunkIndex = recordedSpanChunks;
    } else {
      nextRecordChunkIndex = mergeTargetChunks;
    }
  } else {
    nextRecordChunkIndex = recordedSpanChunks;
  }

  return {
    mergeTargetChunks,
    recordedSpanChunks,
    chunksWithMedia,
    chunksTranscribed,
    chunksFailed,
    minRequiredTranscripts: minRequired,
    transcribeRatio,
    mergeReady,
    combinedTranscriptionUrl: combinedTranscriptionUrl || null,
    failedChunkIndices,
    missingChunkIndices,
    mergeTargetFromSourceDuration,
    nextRecordChunkIndex,
  };
}

/** Normalized URL → deterministic doc id. Throws for invalid URLs. */
export function yujaDocIdForUrl(referenceUrl: string): { docId: string; key: string } {
  const key = normalizeHomeworkCaptureReferenceUrl(referenceUrl.trim());
  if (!key) throw new Error("Invalid reference URL for Yuja doc");
  return { docId: referencePlaybackUrlKeyToYujaDocId(key), key };
}

/**
 * Resolve (or create) the yuja doc for a URL. Idempotent.
 * Returns the doc id and current data (or empty data if newly created).
 */
export async function getOrCreateYujaDoc(
  db: Firestore,
  referenceUrl: string,
  opts?: { chunkMs?: number }
): Promise<{ docId: string; data: YujaDocData; created: boolean }> {
  const trimmed = referenceUrl.trim();
  const { docId, key } = yujaDocIdForUrl(trimmed);
  const ref = db.collection(YUJA_FUNNY_URLS).doc(docId);
  const snap = await ref.get();

  if (snap.exists) {
    return { docId, data: snap.data() as YujaDocData, created: false };
  }

  const seed: YujaDocData = {
    referencePlaybackUrl: trimmed,
    referencePlaybackUrlKey: key,
    segments: {},
    ...(opts?.chunkMs ? { chunkMs: opts.chunkMs } : {}),
  };

  await ref.set({
    ...seed,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { docId, data: seed, created: true };
}

/** Load the yuja doc by URL (no create). Returns null if not found. */
export async function loadYujaDocByUrl(
  db: Firestore,
  referenceUrl: string
): Promise<{ docId: string; data: YujaDocData } | null> {
  const { docId } = yujaDocIdForUrl(referenceUrl);
  const snap = await db.collection(YUJA_FUNNY_URLS).doc(docId).get();
  if (!snap.exists) return null;
  return { docId, data: snap.data() as YujaDocData };
}

/** Load the yuja doc by doc id (no create). Returns null if not found. */
export async function loadYujaDocById(
  db: Firestore,
  yujaDocId: string
): Promise<YujaDocData | null> {
  const snap = await db.collection(YUJA_FUNNY_URLS).doc(yujaDocId).get();
  if (!snap.exists) return null;
  return snap.data() as YujaDocData;
}

/** Persist source video duration (ms) so merge/coverage use the real Yuja length, not recorded span. */
export async function setYujaDocSourceDuration(
  db: Firestore,
  yujaDocId: string,
  sourceDurationMs: number | null
): Promise<void> {
  const ref = db.collection(YUJA_FUNNY_URLS).doc(yujaDocId);
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (sourceDurationMs != null && Number.isFinite(sourceDurationMs) && sourceDurationMs > 0) {
    patch.sourceDurationMs = Math.round(sourceDurationMs);
  } else {
    patch.sourceDurationMs = FieldValue.delete();
  }
  await ref.update(patch);
}

/** Record a chunk WebM URL on the yuja doc (overwrites if the index already exists). */
export async function writeYujaSegmentChunk(
  db: Firestore,
  yujaDocId: string,
  chunkIndex: number,
  chunk: {
    chunkUrl: string;
    chunkMimeType: string;
    chunkName?: string;
    startOffsetMs?: number;
    endOffsetMs?: number;
    durationMs?: number;
    chunkLengthNominalMs?: number;
    durationSource?: "nominal" | "client";
  }
): Promise<void> {
  const key = String(chunkIndex);
  const updates: Record<string, unknown> = {
    [`segments.${key}.chunkUrl`]: chunk.chunkUrl,
    [`segments.${key}.chunkMimeType`]: chunk.chunkMimeType,
    [`segments.${key}.transcriptionStatus`]: "pending",
    // Clear any stale error/transcript from a previous attempt
    [`segments.${key}.transcriptionError`]: FieldValue.delete(),
    [`segments.${key}.transcriptUrl`]: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (chunk.chunkName !== undefined) updates[`segments.${key}.chunkName`] = chunk.chunkName;
  if (chunk.startOffsetMs !== undefined) updates[`segments.${key}.startOffsetMs`] = chunk.startOffsetMs;
  if (chunk.endOffsetMs !== undefined) updates[`segments.${key}.endOffsetMs`] = chunk.endOffsetMs;
  if (chunk.durationMs !== undefined) updates[`segments.${key}.durationMs`] = chunk.durationMs;
  if (chunk.chunkLengthNominalMs !== undefined)
    updates[`segments.${key}.chunkLengthNominalMs`] = chunk.chunkLengthNominalMs;
  if (chunk.durationSource !== undefined) updates[`segments.${key}.durationSource`] = chunk.durationSource;

  await db.collection(YUJA_FUNNY_URLS).doc(yujaDocId).update(updates);
}

/** Record a successful Gemini transcript on a segment. */
export async function writeYujaSegmentTranscript(
  db: Firestore,
  yujaDocId: string,
  chunkIndex: number,
  transcriptUrl: string
): Promise<void> {
  const key = String(chunkIndex);
  await db
    .collection(YUJA_FUNNY_URLS)
    .doc(yujaDocId)
    .update({
      [`segments.${key}.transcriptUrl`]: transcriptUrl,
      [`segments.${key}.transcriptionStatus`]: "complete",
      [`segments.${key}.transcriptionError`]: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/** Mark a segment transcription as failed with a short error. */
export async function writeYujaSegmentTranscriptFailed(
  db: Firestore,
  yujaDocId: string,
  chunkIndex: number,
  message: string
): Promise<void> {
  const key = String(chunkIndex);
  const short = message.length > 500 ? `${message.slice(0, 500)}…` : message;
  await db
    .collection(YUJA_FUNNY_URLS)
    .doc(yujaDocId)
    .update({
      [`segments.${key}.transcriptionStatus`]: "failed",
      [`segments.${key}.transcriptionError`]: short,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch transcript (${res.status})`);
  }
  return res.text();
}

export type MergeYujaSegmentOptions = {
  /** Require at least this fraction of chunks to have `transcriptUrl` (default `YUJA_MERGE_DEFAULT_MIN_RATIO`). */
  minTranscribedRatio?: number;
};

/**
 * Concatenate segment transcript .txt files in chunk order; upload combined file to ByteScale;
 * write `combinedTranscriptionUrl` back to the yuja doc.
 *
 * **Contract:** The uploaded `.txt` is **inner body only** (merge note + segment blocks).
 * Cloud Functions add the outer "## Video walkthrough transcription(s)" / "### Merged segment
 * transcripts" wrapper via `buildPremergedVideoSectionFromUrl` in `gradeFlow.js` when building
 * the full grading corpus — do not duplicate those headings in this file content.
 */
export async function mergeYujaSegmentTranscripts(
  db: Firestore,
  yujaDocId: string,
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>,
  options?: MergeYujaSegmentOptions
): Promise<{
  combinedTranscriptionUrl: string;
  combinedText: string;
  includedChunkIndices: number[];
  omittedChunkIndices: number[];
  minTranscribedRatio: number;
  totalChunks: number;
}> {
  const minRatio = options?.minTranscribedRatio ?? YUJA_MERGE_DEFAULT_MIN_RATIO;
  const docRef = db.collection(YUJA_FUNNY_URLS).doc(yujaDocId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("yuja_funny_urls document not found");
  }
  const data = snap.data() as YujaDocData;
  const segments = data.segments || {};

  const indices = Object.keys(segments)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);

  if (indices.length === 0) {
    throw new Error("No segments recorded yet for this video.");
  }

  const recordedSpanChunks = Math.max(...indices) + 1;
  const chunkMs =
    data.chunkMs && Number.isFinite(data.chunkMs) && data.chunkMs > 0 ? data.chunkMs : 60_000;
  const src = data.sourceDurationMs;
  const mergeTargetChunks =
    src != null && Number.isFinite(src) && src > 0
      ? Math.max(1, Math.ceil(src / chunkMs))
      : recordedSpanChunks;

  const required = requiredTranscriptCount(mergeTargetChunks, minRatio);
  const included: number[] = [];
  const omitted: number[] = [];

  for (let i = 0; i < mergeTargetChunks; i++) {
    const seg = segments[String(i)];
    if (seg?.transcriptUrl) included.push(i);
    else omitted.push(i);
  }

  if (included.length < required) {
    throw new Error(
      `Need at least ${required} of ${mergeTargetChunks} segment transcriptions (~${Math.round(minRatio * 100)}% with transcripts; have ${included.length}). Chunks missing transcript: ${omitted.join(", ") || "—"}.`
    );
  }

  const parts: string[] = [];
  if (omitted.length > 0) {
    parts.push(
      `## Merge note\n\nMerged **${included.length}** of **${mergeTargetChunks}** segments (≥${Math.round(minRatio * 100)}% rule). Omitted indices (no transcript): **${omitted.join(", ")}**.`
    );
  }

  for (const idx of included) {
    const seg = segments[String(idx)];
    if (!seg?.transcriptUrl) continue;
    const text = await fetchTextFromUrl(seg.transcriptUrl);
    parts.push(`### Segment ${idx + 1} (chunk ${idx})\n\n${text.trim()}`);
  }

  const combinedText = parts.join("\n\n---\n\n");
  const fileName = `yuja_funny_urls/${yujaDocId}/combined_walkthrough.txt`;
  const combinedTranscriptionUrl = await uploadTextToBytescale(combinedText, fileName);

  await docRef.update({
    combinedTranscriptionUrl,
    combinedTranscriptionStatus: "complete",
    mergedAt: FieldValue.serverTimestamp(),
    lastMergedSegmentCount: included.length,
    lastMergeOmittedChunkIndices: omitted,
    lastMergeMinRatio: minRatio,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    combinedTranscriptionUrl,
    combinedText,
    includedChunkIndices: included,
    omittedChunkIndices: omitted,
    minTranscribedRatio: minRatio,
    totalChunks: mergeTargetChunks,
  };
}
