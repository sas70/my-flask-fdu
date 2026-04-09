import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalizeHomeworkCaptureReferenceUrl } from "@/lib/homework-capture-reference-url";
import { sessionRef } from "@/lib/homework-capture-server";

/** Firestore collection: one doc per normalized Yuja / LMS video URL. */
export const YUJA_FUNNY_URLS = "yuja_funny_urls";

/** Minimum fraction of session chunks that must have segment transcripts before merge (finalize / Cloud path). */
export const YUJA_MERGE_DEFAULT_MIN_RATIO = 0.9;

export function requiredTranscriptCount(chunkCount: number, minRatio: number): number {
  if (chunkCount <= 0) return 0;
  return Math.max(1, Math.ceil(chunkCount * minRatio - 1e-12));
}

export type YujaProgress = {
  totalChunks: number;
  chunksWithMedia: number;
  chunksTranscribed: number;
  minRequiredTranscripts: number;
  transcribeRatio: number;
  mergeReady: boolean;
  combinedTranscriptionUrl: string | null;
};

/**
 * Progress for tab-capture UI: session chunk indices vs yuja_funny_urls.segments.
 */
export function computeYujaProgress(
  orderedChunkIndices: number[],
  segments: Record<string, YujaSegmentRecord> | undefined,
  combinedTranscriptionUrl: string | null | undefined,
  minRatio: number = YUJA_MERGE_DEFAULT_MIN_RATIO
): YujaProgress {
  const n = orderedChunkIndices.length;
  const seg = segments || {};
  let chunksWithMedia = 0;
  let chunksTranscribed = 0;
  for (const idx of orderedChunkIndices) {
    const s = seg[String(idx)];
    if (s?.chunkUrl) chunksWithMedia += 1;
    if (s?.transcriptUrl) chunksTranscribed += 1;
  }
  const minRequired = requiredTranscriptCount(n, minRatio);
  const transcribeRatio = n > 0 ? chunksTranscribed / n : 0;
  const mergeReady = n > 0 && chunksTranscribed >= minRequired;
  return {
    totalChunks: n,
    chunksWithMedia,
    chunksTranscribed,
    minRequiredTranscripts: minRequired,
    transcribeRatio,
    mergeReady,
    combinedTranscriptionUrl: combinedTranscriptionUrl || null,
  };
}

export type YujaSegmentRecord = {
  chunkUrl?: string;
  chunkMimeType?: string;
  transcriptUrl?: string;
  transcriptionStatus?: "pending" | "complete" | "failed";
  transcriptionError?: string;
};

/**
 * Find or create the `yuja_funny_urls` doc for this video URL (stable key).
 */
export async function getOrCreateYujaFunnyDoc(
  db: Firestore,
  referenceUrl: string
): Promise<{ docId: string; created: boolean }> {
  const trimmed = referenceUrl.trim();
  const key = normalizeHomeworkCaptureReferenceUrl(trimmed);
  if (!key) {
    throw new Error("Invalid reference URL for Yuja doc");
  }

  const snap = await db
    .collection(YUJA_FUNNY_URLS)
    .where("referencePlaybackUrlKey", "==", key)
    .limit(1)
    .get();

  if (!snap.empty) {
    const doc = snap.docs[0];
    return { docId: doc.id, created: false };
  }

  const ref = await db.collection(YUJA_FUNNY_URLS).add({
    referencePlaybackUrl: trimmed,
    referencePlaybackUrlKey: key,
    segments: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { docId: ref.id, created: true };
}

/**
 * If the session has a reference URL, ensure `yujaFunnyUrlsDocId` is set (lookup/create by URL).
 */
export async function ensureSessionYujaFunnyDoc(db: Firestore, sessionId: string): Promise<string | null> {
  const sess = await sessionRef(db, sessionId).get();
  if (!sess.exists) return null;
  const data = sess.data() as Record<string, unknown>;
  const refUrl = typeof data.referencePlaybackUrl === "string" ? data.referencePlaybackUrl.trim() : "";
  if (!refUrl) return null;

  const existing = typeof data.yujaFunnyUrlsDocId === "string" ? data.yujaFunnyUrlsDocId.trim() : "";
  if (existing) return existing;

  const { docId } = await getOrCreateYujaFunnyDoc(db, refUrl);
  await sessionRef(db, sessionId).update({
    yujaFunnyUrlsDocId: docId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return docId;
}

/**
 * After a WebM chunk is on ByteScale, record chunk URL on the Yuja doc (segment map).
 */
export async function writeYujaSegmentChunk(
  db: Firestore,
  yujaDocId: string,
  chunkIndex: number,
  chunkUrl: string,
  chunkMimeType: string
): Promise<void> {
  const key = String(chunkIndex);
  await db
    .collection(YUJA_FUNNY_URLS)
    .doc(yujaDocId)
    .update({
      [`segments.${key}.chunkUrl`]: chunkUrl,
      [`segments.${key}.chunkMimeType`]: chunkMimeType,
      [`segments.${key}.transcriptionStatus`]: "pending",
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * After Gemini + ByteScale .txt upload for one segment.
 */
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
  /** Require at least this fraction of session chunks to have `transcriptUrl` (default `YUJA_MERGE_DEFAULT_MIN_RATIO`). */
  minTranscribedRatio?: number;
};

/**
 * Concatenate segment transcript .txt files in chunk order; upload combined file to ByteScale.
 * Omits segments without a transcript if the **minimum transcript count** (ceil(n × ratio)) is still met.
 */
export async function mergeYujaSegmentTranscripts(
  db: Firestore,
  yujaDocId: string,
  orderedChunkIndices: number[],
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>,
  options?: MergeYujaSegmentOptions
): Promise<{
  combinedTranscriptionUrl: string;
  combinedText: string;
  includedChunkIndices: number[];
  omittedChunkIndices: number[];
  minTranscribedRatio: number;
}> {
  const minRatio = options?.minTranscribedRatio ?? YUJA_MERGE_DEFAULT_MIN_RATIO;
  const docRef = db.collection(YUJA_FUNNY_URLS).doc(yujaDocId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("yuja_funny_urls document not found");
  }
  const data = snap.data() as { segments?: Record<string, YujaSegmentRecord> };
  const segments = data.segments || {};

  const n = orderedChunkIndices.length;
  if (n === 0) {
    throw new Error("No chunks to merge");
  }

  const required = requiredTranscriptCount(n, minRatio);
  const included: number[] = [];
  const omitted: number[] = [];

  for (const idx of orderedChunkIndices) {
    const seg = segments[String(idx)];
    if (seg?.transcriptUrl) {
      included.push(idx);
    } else {
      omitted.push(idx);
    }
  }

  if (included.length < required) {
    throw new Error(
      `Need at least ${required} of ${n} segment transcriptions (~${Math.round(minRatio * 100)}% with transcripts; have ${included.length}). Chunks missing transcript: ${omitted.join(", ") || "—"}.`
    );
  }

  const parts: string[] = [];
  if (omitted.length > 0) {
    parts.push(
      `## Merge note\n\nMerged **${included.length}** of **${n}** segments (≥${Math.round(minRatio * 100)}% rule). Omitted indices (no transcript): **${omitted.join(", ")}**.`
    );
  }

  for (const idx of orderedChunkIndices) {
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
  };
}
